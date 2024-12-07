import fetch from 'node-fetch';
import fs from 'fs';

import logger from './tools/logger.js';
import pnnTask from './tools/pnnTask.js';

// 从 config.json 中读取配置
let config;
try {
    const data = fs.readFileSync('config.json', 'utf8');
    config = JSON.parse(data);
} catch (err) {
    logger.error(`请先配置 config.json, 参考 config.tmpl.json, 错误: ${err}`);
    exit(11);
}

// 解析配置
const { logLevel } = config;
const yeziUsername = config.yezi.username;
const yeziPassword = config.yezi.password;
const yeziProjId = config.yezi.projId;
const taskNum = config.taskNum;

if (!logLevel || !['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    logger.error('请先在 config.json 配置日志等级, 参考 config.tmpl.json');
    exit(12);
}
logger.setLogLevel(logLevel);

if (!yeziUsername || !yeziPassword || !yeziProjId) {
    logger.error('请先在 config.json 配置椰子账号和项目信息, 参考 config.tmpl.json');
    exit(13);
}

if (!taskNum || taskNum <= 0) {
    logger.error('请先在 config.json 配置任务数量, 参考 config.tmpl.json');
    exit(14);
}


const yeziApiBaseUrl = 'http://api.sqhyw.net:90/api/';
const yeziApiLoginUrl = `${yeziApiBaseUrl}logins?username=${yeziUsername}&password=${yeziPassword}`;
// 返回示例:
// {
//     "token": "mhLO3K8DPMg5L/kkXWBpnemaI6D8iU6Nlz+LciAbi8ZRzFgdxK1UYN4BGSR3w5O0dQM+SASLQVJmof5NJ8LtT4/+YoXpXDtnjpwMFirlGJwjlx3sMLPLaa1M5y",
//     "data": [{
//     "money": "300",
//     "money_1": "0.0000",
//     "id": "10000",
//     "leixing": "用户"
//     }]
//     }
const yeziGetMobileUrl = `${yeziApiBaseUrl}get_mobile?api_id=8416297&project_id=${yeziProjId}&token={{token}}`;
// 返回示例:
// {
//     "message": "ok",
//     "mobile": "16532643928",
//     "data": [],
//     "1分钟内剩余取卡数": "298"}
// 剩余取卡数如果小于10时 停止请求,否则拉黑IP需要1个小时才释放
const yeziGetMessageUrl = `${yeziApiBaseUrl}get_message?project_id=${yeziProjId}&token={{token}}&phone_num={{mobile}}`;
// 短信如果还没到返回实例,返回这个请继续请求：
// {
//     "message": "ok",
//     "data": []
// }
// 短信到达返回实例：
// {
//     "message": "ok",
//     "code": "807272",
//     "data": [{
//         "project_id": "10079",
//         "modle": "【酷狗音乐】您的登录验证码807272。如非本人操作，请不要把验证码泄露给任何人。",
//         "phone": "16532645760",
//         "project_type": "1"
//     }]
// }
const yeziFreeMobileUrl = `${yeziApiBaseUrl}free_mobile?project_id=${yeziProjId}&token={{token}}&phone_num={{mobile}}`;
// 获取到短信后, 或者取号后200s内没有短信到达, 都需要释放手机号
// 返回示例：
//  {
//   "message": "ok",
//     "data": []
// }
const yeziAddBlacklistUrl = `${yeziApiBaseUrl}add_blacklist?project_id=${yeziProjId}&token={{token}}&phone_num={{mobile}}`;
// {
//     "message": "ok",
//     "data": []
// }

/**
 * 登录椰子账号
 * @returns {Promise<string>} 登录成功返回 token, 失败直接退出
 */
async function yeziLogin() {
    try {
        const res = await fetch(yeziApiLoginUrl);
        const json = await res.json();
        if (json.token) {
            logger.info('椰子登录成功');
            logger.debug(`椰子账号信息: ${JSON.stringify(json.data)}`);
            return json.token;
        } else {
            logger.error(`椰子登录失败: ${JSON.stringify(json)}`);
            exit(22);
        }
    } catch (err) {
        logger.error(`椰子登录失败, 网络异常: ${err}`);
        exit(21);
    }
}

/**
 * 获取一个手机号
 * @param {string} token 登录成功后的 token
 * @returns {Promise<string>} 获取成功返回手机号, 失败返回空字符串
 */
async function yeziGetMobile(token) {
    try {
        const url = yeziGetMobileUrl.replace('{{token}}', token);
        // logger.debug(`开始获取手机号, url=${url.replace(token, '***')}`);
        const res = await fetch(url);
        const json = await res.json();
        if (json.mobile) {
            logger.info(`获取手机号成功: ${json.mobile}`);
            return json.mobile;
        } else {
            logger.error(`获取手机号失败: ${JSON.stringify(json)}`);
            return '';
        }
    } catch (err) {
        logger.error(`获取手机号失败, 网络异常: ${err}`);
        return '';
    }
}

/**
 * 获取短信验证码
 * @param {string} token 登录成功后的 token
 * @param {string} mobile 获取到的手机号
 * @returns {Promise<string>} 获取成功返回短信验证码, 失败返回空字符串
 */
async function yeziGetMessage(token, mobile) {
    try {
        const url = yeziGetMessageUrl.replace('{{token}}', token).replace('{{mobile}}', mobile);
        const res = await fetch(url);
        const json = await res.json();
        if (json.code) {
            logger.info(`${mobile} 获取短信成功: ${json.code}`);
            return json.code;
        } else {
            logger.debug(`${mobile} 未获取到短信, 返回信息: ${JSON.stringify(json)}`);
            return '';
        }
    } catch (err) {
        logger.error(`${mobile} 获取短信失败, 网络异常: ${err}`);
        return '';
    }
}

/**
 * 释放手机号
 * @param {string} token 登录成功后的 token
 * @param {string} mobile 获取到的手机号
 * @returns {Promise<boolean>} 释放成功返回 true, 失败返回 false
 */
async function yeziFreeMobile(token, mobile) {
    try {
        const url = yeziFreeMobileUrl.replace('{{token}}', token).replace('{{mobile}}', mobile);
        logger.debug(`${mobile} 释放手机号, url=${url.replace(token, '***')}`);
        const res = await fetch(url);
        const json = await res.json();
        if (json.message === 'ok') {
            logger.info(`${mobile} 释放手机号成功`);
            return true;
        } else {
            logger.error(`${mobile} 释放手机号失败: ${JSON.stringify(json)}`);
            return false;
        }
    } catch (err) {
        logger.error(`${mobile} 释放手机号失败, 网络异常: ${err}`);
        return false;
    }
}

/**
 * 拉黑手机号
 * @param {string} token 登录成功后的 token
 * @param {string} mobile 获取到的手机号
 * @returns {Promise<boolean>} 拉黑成功返回 true, 失败返回 false
 */
async function yeziAddBlacklistMobile(token, mobile) {
    try {
        const blacklistUrl = yeziAddBlacklistUrl.replace('{{token}}', token).replace('{{mobile}}', mobile);
        logger.debug(`${mobile} 拉黑手机号, url=${blacklistUrl.replace(token, '***')}`);
        const blacklistRes = await fetch(blacklistUrl);
        const blacklistJson = await blacklistRes.json();
        if (blacklistJson.message === '拉黑成功') {
            logger.info(`${mobile} 拉黑手机号成功`);
            return true;
        } else {
            logger.error(`${mobile} 拉黑手机号失败: ${JSON.stringify(blacklistJson)}`);
            return false;
        }
    } catch (err) {
        logger.error(`${mobile} 拉黑手机号失败, 网络异常: ${err}`);
        return false;
    }
}

/**
 * 睡眠
 * @param {number} ms 睡眠时间, 单位毫秒
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 退出
 */
function exit(code) {
    process.exit(code);
}

// 主逻辑
(async function main() {
    logger.info('开始登录椰子账号');
    const token = await yeziLogin();

    if (!token) {
        logger.error('登录失败，程序退出');
        exit(22);
    }

    let i = 0;
    while (i < taskNum) {
        logger.info(`开始执行第 ${i + 1}/${taskNum} 次任务`);
        const mobile = await yeziGetMobile(token);
        if (mobile) {
            const pnnSendCodeRsp = await pnnTask.sendCode(mobile, i + 1, taskNum);
            if (pnnSendCodeRsp && pnnSendCodeRsp.code === 200) {
                logger.info(`${mobile} 发送验证码成功, 开始获取短信`);
                let j = 0;
                while (j < 100) {
                    const message = await yeziGetMessage(token, mobile);
                    if (message) {
                        logger.info(`${mobile} 获取到短信: ${message}`);
                        pnnTask.startTaskByCode(mobile, message, i + 1, taskNum);
                        yeziFreeMobile(token, mobile);
                        yeziAddBlacklistMobile(token, mobile);
                        break;
                    } else {
                        logger.debug(`${mobile} 未获取到短信, 2s 后继续获取`);
                        j++;
                        await sleep(2000);
                    }
                }
                if (j >= 100) {
                    logger.error(`${mobile} 未获取到短信, 重试次数超过 100 次, 释放手机号`);
                    yeziFreeMobile(token, mobile);
                }
                i++;
            } else if (pnnSendCodeRsp?.code === 1001) {
                // 发送验证码频繁, 冷却 5s
                logger.error(`${mobile} 发送验证码失败: ${pnnSendCodeRsp.message}, 冷却 5s`);
                await sleep(5000);
            } else {
                logger.error(`${mobile} 发送验证码失败: ${JSON.stringify(pnnSendCodeRsp)}`);
                yeziFreeMobile(token, mobile);
            }
        }
        await sleep(5000);
    }
    logger.info(`任务全部提交完毕, 共提交 ${taskNum} 次`);
})();
