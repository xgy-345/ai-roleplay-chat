require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json({ limit: '10mb' }));

// 配置 - 使用示例中的命名规范
const QINIU_AI_API_KEY = process.env.QINIU_AI_API_KEY;
const OPENAI_BASE_URL = 'https://openai.qiniu.com/v1';

if (!QINIU_AI_API_KEY) {
    console.error("严重错误：.env 文件中的 QINIU_AI_API_KEY 未设置！");
    process.exit(1);
}

// 配置axios实例
const qiniuAxios = axios.create({
    baseURL: OPENAI_BASE_URL,
    headers: {
        'Authorization': `Bearer ${QINIU_AI_API_KEY}`,
        'Content-Type': 'application/json'
    },
    timeout: 30000
});

/**
 * TTS服务类 - 按照示例风格重构
 */
class TTSService {
    constructor({ 
        baseUrl = OPENAI_BASE_URL,
        apiKey = QINIU_AI_API_KEY,
        defaultVoice = 'alloy',
        defaultSpeed = 1.0
    } = {}) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.defaultVoice = defaultVoice;
        this.defaultSpeed = defaultSpeed;
    }

    /**
     * 文本转语音
     * @param {string} text - 要转换的文本
     * @param {Object} config - 配置参数
     * @returns {Promise<Buffer>} 音频数据
     */
    async textToSpeech(text, config = {}) {
        try {
            if (!text || text.trim().length === 0) {
                throw new Error('文本内容不能为空');
            }

            const payload = {
                model: "tts-1",
                input: text.trim(),
                voice: config.voice || this.defaultVoice,
                speed: config.speed || this.defaultSpeed,
                response_format: "mp3"
            };

            console.log('[TTS] 请求参数:', {
                text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
                voice: payload.voice,
                speed: payload.speed
            });

            const response = await axios.post(
                `${this.baseUrl}/audio/speech`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: 30000
                }
            );

            if (response.status === 200 && response.data instanceof Buffer) {
                console.log('[TTS] 合成成功，音频大小:', response.data.length, 'bytes');
                return response.data;
            } else {
                throw new Error(`TTS服务返回异常状态: ${response.status}`);
            }
        } catch (error) {
            console.error('[TTS] 合成失败:', error.message);
            if (error.response) {
                console.error('[TTS] 错误详情:', error.response.data);
            }
            throw error;
        }
    }

    /**
     * 获取支持的音色列表
     */
    getAvailableVoices() {
        return [
            { id: "alloy", name: "Alloy", language: "多语言" },
            { id: "echo", name: "Echo", language: "多语言" },
            { id: "fable", name: "Fable", language: "多语言" },
            { id: "onyx", name: "Onyx", language: "多语言" },
            { id: "nova", name: "Nova", language: "多语言" },
            { id: "shimmer", name: "Shimmer", language: "多语言" }
        ];
    }
}

// 初始化TTS服务
const ttsService = new TTSService();

/**
 * LLM服务类 - 按照示例风格重构
 */
class LLMService {
    constructor({
        baseUrl = OPENAI_BASE_URL,
        apiKey = QINIU_AI_API_KEY,
        defaultModel = 'gpt-3.5-turbo'
    } = {}) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.defaultModel = defaultModel;
    }

    /**
     * 聊天补全
     * @param {Array} messages - 消息历史
     * @param {Object} options - 选项
     */
    async chatCompletion(messages, options = {}) {
        try {
            const payload = {
                model: options.model || this.defaultModel,
                messages: messages,
                stream: false,
                temperature: options.temperature || 0.7,
                max_tokens: options.max_tokens || 1000
            };

            console.log('[LLM] 请求消息数:', messages.length);

            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            );

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                const result = response.data.choices[0].message.content;
                console.log('[LLM] 回复长度:', result.length);
                return response.data;
            } else {
                throw new Error('LLM返回数据格式异常');
            }
        } catch (error) {
            console.error('[LLM] 推理失败:', error.message);
            if (error.response) {
                console.error('[LLM] 错误详情:', error.response.data);
            }
            throw error;
        }
    }
}

// 初始化LLM服务
const llmService = new LLMService();

// Express路由

// TTS路由
app.post('/api/tts', async (req, res) => {
    try {
        const { text, tts_config = {} } = req.body;
        
        if (!text) {
            return res.status(400).json({ 
                error: { 
                    message: "text参数是必需的",
                    code: "MISSING_TEXT" 
                } 
            });
        }

        const audioBuffer = await ttsService.textToSpeech(text, {
            voice: tts_config.voice,
            speed: tts_config.speed
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', audioBuffer.length);
        res.setHeader('Content-Disposition', 'inline; filename="speech.mp3"');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(audioBuffer);

    } catch (error) {
        console.error('[API][TTS] 接口错误:', error.message);
        res.status(500).json({ 
            error: { 
                message: `TTS合成失败: ${error.message}`,
                code: "TTS_SERVICE_ERROR",
                details: error.response?.data || null
            } 
        });
    }
});

// 聊天路由
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, model, temperature, max_tokens } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ 
                error: { 
                    message: "messages参数必须是数组",
                    code: "INVALID_MESSAGES" 
                } 
            });
        }

        const response = await llmService.chatCompletion(messages, {
            model,
            temperature,
            max_tokens
        });

        res.json(response);

    } catch (error) {
        console.error('[API][Chat] 接口错误:', error.message);
        res.status(500).json({ 
            error: { 
                message: `AI聊天失败: ${error.message}`,
                code: "LLM_SERVICE_ERROR",
                details: error.response?.data || null
            } 
        });
    }
});

// 获取音色列表
app.get('/api/voices', (req, res) => {
    try {
        const voices = ttsService.getAvailableVoices();
        res.json({ 
            success: true, 
            data: voices 
        });
    } catch (error) {
        console.error('[API][Voices] 接口错误:', error);
        res.status(500).json({ 
            error: { 
                message: "获取音色列表失败",
                code: "VOICES_LIST_ERROR" 
            } 
        });
    }
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        services: {
            tts: 'available',
            llm: 'available'
        }
    });
});

// 根路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 错误处理中间件
app.use((error, req, res, next) => {
    console.error('[APP] 未捕获的错误:', error);
    res.status(500).json({ 
        error: { 
            message: "服务器内部错误",
            code: "INTERNAL_SERVER_ERROR" 
        } 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 服务器已启动，运行在 http://localhost:${PORT}`);
    console.log(`📚 API文档: http://localhost:${PORT}/`);
    console.log(`❤️  健康检查: http://localhost:${PORT}/api/health`);
    console.log(`🔊 TTS服务: 可用 (${ttsService.getAvailableVoices().length} 种音色)`);
    console.log(`🤖 LLM服务: 可用 (模型: ${llmService.defaultModel})`);
});