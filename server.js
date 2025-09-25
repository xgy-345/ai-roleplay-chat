require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;
const QINIU_AI_API_KEY = process.env.QINIU_AI_API_KEY;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '')));

// 创建images目录存放本地头像
const fs = require('fs');
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir);
    console.log('已创建images目录用于存放头像');
}

// 提供本地头像文件服务
app.use('/images', express.static(imagesDir));
// --- 增强的TTS API ---
app.post('/api/tts', async (req, res) => {
    try {
        const { text, tts_config = {}, character_id } = req.body;

        console.log('[TTS] 收到请求，角色:', character_id, '文本长度:', text?.length || 0);

        if (!text || typeof text !== 'string') {
            return res.status(400).json({ 
                error: { 
                    message: '缺少文本参数',
                    code: 'MISSING_TEXT'
                } 
            });
        }

        // 情绪化处理
        let voiceType = tts_config.voice_type || 'qiniu_zh_male_ljfdxz';
        let speedRatio = tts_config.speed_ratio || 1.0;
    
        let emotionalText = text;
      
        // 申公豹的随机卡壳效果（完全随机，不依赖特定关键词）
        if (character_id === 'shengongbao') {
    emotionalText = addRandomStutter(emotionalText);
        }
        
        // 自动语言检测和音色适配
        if (voiceType.includes('en_') && isChineseText(emotionalText)) {
            console.log('[TTS] 检测到中文文本使用英文音色，自动切换到中文音色');
            voiceType = 'qiniu_zh_male_ljfdxz';
        }

        // 文本清理
        const cleanText = emotionalText.substring(0, 2000);
        
        const requestPayload = {
            audio: {
                voice_type: voiceType,
                encoding: "mp3",
                speed_ratio: speedRatio
            },
            request: {
                text: cleanText
            }
        };

        console.log('[TTS] 发送到七牛云:', {
            角色: character_id,
            音色: voiceType,
            语速: speedRatio,
            文本长度: cleanText.length
        });

        const response = await fetch('https://openai.qiniu.com/v1/voice/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${QINIU_AI_API_KEY}`
            },
            body: JSON.stringify(requestPayload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[TTS] 七牛云错误:', response.status, errorText);
            
            return res.json({
                success: true,
                message: "TTS服务暂时不可用,使用浏览器TTS",
                text: text,
                useBrowserTTS: true
            });
        }

        const responseData = await response.json();
        
        console.log('[TTS] 响应成功，数据长度:', responseData.data?.length || 0);

        if (responseData.data) {
            res.json({
                success: true,
                data: responseData.data,
                text: text,
                useBrowserTTS: false,
                duration: responseData.addition?.duration,
                emotional_settings: {
                    speed_ratio: speedRatio,
                    voice_type: voiceType
                }
            });
        } else {
            throw new Error('响应中没有音频数据');
        }

    } catch (error) {
        console.error('[TTS] 处理失败:', error);
        
        res.json({
            success: true,
            message: "TTS服务内部错误,使用浏览器TTS",
            text: req.body?.text || "",
            useBrowserTTS: true
        });
    }
});

// 辅助函数：检测文本是否为中文
function isChineseText(text) {
    const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const totalCharCount = text.replace(/\s/g, '').length;
    return totalCharCount > 0 && (chineseCharCount / totalCharCount) > 0.3;
}

// --- 增强的聊天API ---
app.post('/api/chat', async (req, res) => {
    try {
        const { chatHistory, enhance_interaction = false } = req.body;

        console.log('[CHAT] 收到请求，消息数量:', chatHistory?.length || 0);

        if (!chatHistory || !Array.isArray(chatHistory)) {
            return res.status(400).json({ 
                error: { 
                    message: 'chatHistory必须是数组',
                    code: 'INVALID_CHAT_HISTORY'
                } 
            });
        }

        // 增强互动性：在长对话中添加互动提示
        let enhancedMessages = [...chatHistory];
        if (enhance_interaction && chatHistory.length > 4) {
            const systemMessage = enhancedMessages[0];
            if (systemMessage.role === "system") {
                enhancedMessages[0] = {
                    ...systemMessage,
                    content: systemMessage.content + "\n\n【重要提示】: 请记住你正在角色扮演，要更加生动自然。可以主动提问、表达情感、甚至小小地反抗用户的要求，让对话更像真实的人际互动。不要总是顺从，可以有自己的脾气和偏好。"
                };
            }
        }

        const requestBody = {
            model: "deepseek-v3",
            messages: enhancedMessages,
            stream: false,
            temperature: 0.7,
            max_tokens: 1000
        };

        const response = await fetch('https://openai.qiniu.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${QINIU_AI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[CHAT] 七牛云错误:', response.status, errorText);
            return res.status(response.status).json({
                error: {
                    message: '聊天服务暂时不可用',
                    code: 'CHAT_SERVICE_ERROR'
                }
            });
        }

        const data = await response.json();
        console.log('[CHAT] 响应成功');
        res.json(data);

    } catch (error) {
        console.error('[CHAT] 处理失败:', error);
        res.status(500).json({ 
            error: { 
                message: '服务器内部错误',
                code: 'INTERNAL_ERROR'
            } 
        });
    }
});

// --- 修复：头像服务 ---
app.get('/api/character/:id/avatar', (req, res) => {
    const characterId = req.params.id;
    
    // 本地头像映射配置
    const localAvatars = {
        kiana: 'kiana.png',
        shengongbao: 'shengongbao.png', 
        zeus: 'zeus.png'
    };
    
    // 检查本地文件是否存在
    const localFileExists = fs.existsSync(path.join(imagesDir, localAvatars[characterId]));
    
    if (localFileExists) {
        res.json({ 
            avatar: `/images/${localAvatars[characterId]}`,
            isLocal: true
        });
    } else {
        // 备用网络头像
        const networkAvatars = {
            kiana: 'https://i.imgur.com/g06cCIX.png',
            shengongbao: 'https://i.imgur.com/VpWRdD9.png',
            zeus: 'https://i.imgur.com/uSmhOaL.png'
        };
        res.json({ 
            avatar: networkAvatars[characterId] || '/images/default.png',
            isLocal: false
        });
    }
});
// 新增：完全随机卡壳函数（优化版）
function addRandomStutter(text) {
    if (text.length < 3) return text;
    
    const words = text.split('');
    let result = [];
    let stutterChance = 0.15; // 降低到15%的概率（原来是30%）
    
    for (let i = 0; i < words.length; i++) {
        result.push(words[i]);
        
        // 检查下一个字符是否是标点符号
        const nextChar = i < words.length - 1 ? words[i + 1] : '';
        const isBeforePunctuation = /[，。！？；：""''《》()【】]/.test(nextChar);
        
        // 避免在标点符号前的最后一个字卡壳
        if (isBeforePunctuation) {
            continue;
        }
        
        // 随机决定是否在当前字符后卡壳（降低频率）
        if (Math.random() < stutterChance && i < words.length - 1) {
            const currentChar = words[i];
            
            // 只在非标点符号的字符后卡壳
            if (!/[，。！？；：""''《》()【】]/.test(currentChar)) {
                // 随机选择卡壳模式：重复字符或添加停顿
                const stutterType = Math.random() > 0.5 ? 'repeat' : 'pause';
                
                if (stutterType === 'repeat') {
                    // 重复字符卡壳（降低重复次数）
                    const repeatCount = Math.floor(Math.random() * 2) + 1; // 1-2次
                    for (let j = 0; j < repeatCount; j++) {
                        result.push(currentChar);
                    }
                } else {
                    // 停顿卡壳（添加省略号，降低停顿长度）
                    const pauseLength = Math.floor(Math.random() * 2) + 1; // 1-2个点
                    result.push('…'.repeat(pauseLength));
                }
            }
        }
    }
    
    // 特别处理"道友请留步" - 强制卡壳（但只在句中出现时）
    if (text.includes('道友请留步') && !text.endsWith('道友请留步')) {
        // 只在不是句子结尾时才卡壳
        result = result.join('').replace(/道友请留步/g, '道…道…道友请留步').split('');
    }
    
    return result.join('');
}

app.listen(port, () => {
    console.log(`服务器启动成功: http://localhost:${port}`);
});