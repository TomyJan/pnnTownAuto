import fetch from 'node-fetch';
import logger from './logger.js';

export default class pnnTask {
    static pnnApiBaseUrl = 'https://paninitown-api.kurogames-global.com/';
    static pnnApiSendCodeUrl = `${pnnTask.pnnApiBaseUrl}mobile/send`;
    static pnnApiLoginUrl = `${pnnTask.pnnApiBaseUrl}mobile/login`;

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
            logger.warn(`帕尼尼小镇${mobile},验证码${code}`);
            // 模拟任务逻辑，如果需要发送请求，可以替换为实际接口调用
            return true;
        } catch (err) {
            logger.error(`帕尼尼小镇任务启动失败: ${err}`);
            return false;
        }
    }
}
