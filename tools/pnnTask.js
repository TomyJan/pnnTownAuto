import fetch from 'node-fetch';
import fs from 'fs';
import logger from './logger.js';

export default class pnnTask {
    static pnnApiBaseUrl = 'https://paninitown-api.kurogames-global.com/';
    static pnnApiSendCodeUrl = `${pnnTask.pnnApiBaseUrl}mobile/send`;
    static pnnApiLoginUrl = `${pnnTask.pnnApiBaseUrl}mobile/login`;
    static pnnApiUserInfoUrl = `${pnnTask.pnnApiBaseUrl}user/getInfo`;
    static pnnApiEggCollectTaskUrl = `${pnnTask.pnnApiBaseUrl}egg/collect`;
    static pnnApiEggShareTaskUrl = `${pnnTask.pnnApiBaseUrl}egg/share`;
    static pnnApiDrawUrl = `${pnnTask.pnnApiBaseUrl}draw/get`;
    static pnnApiDrawPrizeUrl = `${pnnTask.pnnApiBaseUrl}draw/prize`;

    /**
     * 发送验证码
     * @param {string} mobile 手机号
     * @returns {Promise<object|string>} 返回原始响应体，如果失败返回空字符串
     */
    static async sendCode(mobile) {
        // post mobile/send , 请求体 mobile=xxx, 响应体 json , 返回原始响应体, 无需处理, 如果请求出错, 返回空字符串并在此打印错误
        try {
            const res = await fetch(pnnTask.pnnApiSendCodeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `mobile=${mobile}`,
            });
            const json = await res.json();
            if (json.code) {
                logger.debug(`${mobile} 发送短信成功: ${JSON.stringify(json)}`);
                return json;
            } else {
                logger.error(`${mobile} 发送短信失败: ${JSON.stringify(json)}`);
                return '';
            }
        } catch (err) {
            logger.error(`${mobile} 发送短信失败, 网络异常: ${err}`);
            return '';
        }
    }

    /**
     * 模拟任务开始，通过验证码进行登录
     * @param {string} mobile 手机号
     * @param {string} code 短信验证码
     * @returns {Promise<boolean>} 返回任务是否成功开始
     */
    static async startTaskByCode(mobile, code) {
        try {
            logger.warn(`帕尼尼小镇${mobile},验证码${code}  任务开始`);
            // 登录
            const loginRsp = await fetch(pnnTask.pnnApiLoginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `mobile=${mobile}&code=${code}`,
            });
            let loginJson;
            try {
                loginJson = await loginRsp.json();
            } catch (err) {
                logger.error(`${mobile} 登录失败, 网络错误: ${err}, 重试一次`);
                try {
                    loginJson = await loginRsp.json();
                } catch (err) {
                    logger.error(`${mobile} 登录失败, 网络错误: ${err}, 放弃任务`);
                    // 将手机号, 验证码, 当前 UTC+8 时间, 追加到 data/abandonTask/cause-login-failed.txt 文件结尾
                    fs.appendFileSync('data/abandonTask/cause-login-failed.txt', `帕尼尼小镇${mobile},验证码${code}    ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
                    return false;
                }
                return false;
            }
            const token = loginJson.data.token;
            logger.info(`${mobile} 登录成功, rsp=${JSON.stringify(loginJson).replace(token, '***')}`);
            // 将手机号, 验证码, 获取到的 token, 当前 UTC+8 时间, 追加到 data/accountRecord/accounts.txt 文件结尾
            fs.appendFileSync('data/accountRecord/accounts.txt', `帕尼尼小镇${mobile},验证码${code},token=${token}    ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
            // 获取用户信息
            const userInfoRsp = await fetch(pnnTask.pnnApiUserInfoUrl, {
                headers: {
                    token,
                },
            });
            let userInfoJson;
            try {
                userInfoJson = await userInfoRsp.json();
            } catch (err) {
                logger.error(`${mobile} 获取用户信息失败, 网络错误: ${err}, 重试一次`);
                try {
                    userInfoJson = await userInfoRsp.json();
                } catch (err) {
                    logger.error(`${mobile} 获取用户信息失败, 网络错误: ${err}, 放弃任务`);
                    // 将手机号, 验证码, 当前 UTC+8 时间, 追加到 data/abandonTask/cause-get-user-info-failed.txt 文件结尾
                    fs.appendFileSync('data/abandonTask/cause-get-user-info-failed.txt', `帕尼尼小镇${mobile},验证码${code},token=${token}    ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
                    return false;
                }
                return false;
            }
            logger.info(`${mobile} 获取用户信息成功, rsp=${JSON.stringify(userInfoJson)}`);
            const taskCount = userInfoJson?.data?.num ?? -1;
            const eggRemain = userInfoJson?.data?.chance_num ?? -1;
            logger.info(`${mobile} 已完成任务次数: ${taskCount}, 剩余蛋: ${eggRemain}`);
            // 如果 taskCount < 20 , 开始做任务
            if (taskCount < 20) {
                logger.info(`${mobile} 任务未完成, 开始做任务`);
                // 做任务
                // 1. egg/collect, 请求体为 egg_id, 1-18, 出错则重试一次, 如果还是出错, 跳过此蛋
                for (let eggId = 1; eggId <= 18; eggId++) {
                    const eggCollectRsp = await fetch(pnnTask.pnnApiEggCollectTaskUrl, {
                        method: 'POST',
                        headers: {
                            token,
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: `egg_id=${eggId}`,
                    });
                    let eggCollectJson;
                    try {
                        eggCollectJson = await eggCollectRsp.json();
                    } catch (err) {
                        logger.error(`${mobile} egg/collect 任务失败, 网络错误: ${err}, 重试一次`);
                        try {
                            eggCollectJson = await eggCollectRsp.json();
                        } catch (err) {
                            logger.error(`${mobile} egg/collect 任务失败, 网络错误: ${err}, 跳过此蛋`);
                            // 将手机号, 验证码, 当前 UTC+8 时间, 追加到 data/abandonTask/cause-egg-collect-failed.txt 文件结尾
                            fs.appendFileSync('data/abandonTask/cause-egg-collect-failed.txt', `帕尼尼小镇${mobile},验证码${code},token=${token}    ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
                        }
                    }
                    logger.debug(`${mobile} egg/collect 任务成功, rsp=${JSON.stringify(eggCollectJson)}`);
                    // 解析 eggCollectJson, 如果 eggCollectJson.code === 200 , 则认为任务成功
                    if (eggCollectJson.code === 200) {
                        logger.info(`${mobile} egg/collect 任务成功`);
                    } else {
                        logger.warn(`${mobile} egg/collect 任务失败, rsp=${JSON.stringify(eggCollectJson)}`);
                    }
                }
                // 2. egg/share
                const eggShareRsp = await fetch(pnnTask.pnnApiEggShareTaskUrl, {
                    headers: {
                        token,
                    },
                });
                let eggShareJson;
                try {
                    eggShareJson = await eggShareRsp.json();
                } catch (err) {
                    logger.error(`${mobile} egg/share 任务失败, 网络错误: ${err}, 重试一次`);
                    try {
                        eggShareJson = await eggShareRsp.json();
                    } catch (err) {
                        logger.error(`${mobile} egg/share 任务失败, 网络错误: ${err}, 放弃任务`);
                        // 将手机号, 验证码, 当前 UTC+8 时间, 追加到 data/abandonTask/cause-egg-share-failed.txt 文件结尾
                        fs.appendFileSync('data/abandonTask/cause-egg-share-failed.txt', `帕尼尼小镇${mobile},验证码${code},token=${token}    ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
                    }
                }
            } else {
                logger.info(`${mobile} 任务已完成, 跳过自动任务`);
            }

            // 简单粗暴抽奖 23 次, 其中 url param type=1 . 如果返回 code=1203 则说明已经抽奖完毕, 结束抽奖
            for (let i = 1; i < 25; i++) {
                const drawRsp = await fetch(`${pnnTask.pnnApiDrawUrl}?type=1`, {
                    headers: {
                        token,
                    },
                });
                let drawJson;
                try {
                    drawJson = await drawRsp.json();
                } catch (err) {
                    logger.warn(`${mobile} 第 ${i} 次抽奖失败, 网络错误: ${err}`);
                }
                if (drawJson.code === 1203) {
                    logger.info(`${mobile} 抽奖完毕, 退出抽奖`);
                    break;
                }
                logger.info(`${mobile} 第 ${i} 次抽奖结果: ${JSON.stringify(drawJson)}`);
            }

            // 获取奖品
            const drawPrizeRsp = await fetch(pnnTask.pnnApiDrawPrizeUrl, {
                headers: {
                    token,
                },
            });
            let drawPrizeJson;
            try {
                drawPrizeJson = await drawPrizeRsp.json();
            } catch (err) {
                logger.error(`${mobile} 获取奖品失败, 网络错误: ${err}, 重试一次`);
                try {
                    drawPrizeJson = await drawPrizeRsp.json();
                } catch (err) {
                    logger.error(`${mobile} 获取奖品失败, 网络错误: ${err}, 放弃任务`);
                    // 将手机号, 验证码, 当前 UTC+8 时间, 追加到 data/abandonTask/cause-get-prize-failed.txt 文件结尾
                    fs.appendFileSync('data/abandonTask/cause-get-prize-failed.txt', `帕尼尼小镇${mobile},验证码${code},token=${token}    ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
                    return false;
                }
                return false;
            }
            logger.info(`${mobile} 获取奖品成功, rsp=${JSON.stringify(drawPrizeJson).substring(0, 90)}`);
            // 取出 drawPrizeJson.data 数组, 判断 type_ename , 如果为 cdkey , 则将 code, 手机号, token, 当前 UTC+8 时间 追加到 data/prizeRecord/cdkey.txt 文件结尾. 否则, 将 item_name, 手机号, token, 当前 UTC+8 时间 追加到 data/prizeRecord/other.txt 文件结尾
            for (const prize of drawPrizeJson.data) {
                if (prize.type_ename === 'cdkey') {
                    fs.appendFileSync('data/prizeRecord/cdkey.txt', `${prize.code},帕尼尼小镇${mobile},验证码${code},token=${token}    ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
                } else {
                    fs.appendFileSync('data/prizeRecord/other.txt', `${prize.item_name},帕尼尼小镇${mobile},验证码${code},token=${token}    ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);
                    logger.warn(`${mobile} 抽到好东西啦: ${JSON.stringify(prize)}`);
                }
            }
            logger.info(`${mobile} 任务完成`);
        
            return true;
        } catch (err) {
            logger.error(`帕尼尼小镇任务启动失败: ${err}`);
            return false;
        }
    }
}
