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

// 本地头像映射配置
const localAvatars = {
    kiana: 'kiana.png',
    shengongbao: 'shengongbao.png', 
    zeus: 'zeus.png'
};

// --- 新增：情绪化TTS处理模块 ---
function processTextForTTS(text, characterId) {
    // 移除*...*之间的动作描述（前端已经移除，这里做二次保障）
    let processedText = text.replace(/\*[^*]*\*/g, '');
    
    // 角色特定的情绪处理
    switch (characterId) {
        case 'shengongbao':
            // 申公豹：随机卡壳 + 意味深长的停顿
            processedText = processShengongbaoStutter(processedText);
            
            // 添加意味深长的省略号（20%概率）
            if (Math.random() < 0.2) {
                const sentences = processedText.split(/[。！？]/);
                if (sentences.length > 1) {
                    const insertIndex = Math.floor(Math.random() * (sentences.length - 1)) + 1;
                    sentences.splice(insertIndex, 0, '......');
                    processedText = sentences.join('。').replace(/。。/g, '。');
                }
            }
            break;
            
        case 'zeus':
            // 宙斯：威严的语气，偶尔加重关键词
            if (Math.random() < 0.3) {
                const importantWords = ['凡人', '神', '雷霆', '奥林匹斯', '力量'];
                for (const word of importantWords) {
                    if (processedText.includes(word)) {
                        processedText = processedText.replace(word, word + '！');
                        break;
                    }
                }
            }
            break;
            
        case 'kiana':
            // 琪亚娜：活泼的语气，添加语气词
            if (Math.random() < 0.4) {
                const exclamations = ['呀', '呐', '嘿嘿', '哦'];
                const randomExclamation = exclamations[Math.floor(Math.random() * exclamations.length)];
                
                // 在句子开头或结尾随机添加语气词
                if (Math.random() < 0.5) {
                    processedText = randomExclamation + '，' + processedText;
                } else {
                    processedText = processedText + '，' + randomExclamation + '！';
                }
            }
            break;
    }
    
    return processedText;
}

// --- 新增：申公豹卡壳逻辑 ---
function processShengongbaoStutter(text) {
    if (!text || text.length < 2) return text;
    
    let result = text;
    const stutterWords = ['道友', '这个', '那个', '其实', '不过', '但是', '所以'];
    const stutterPatterns = [
        // 轻微卡壳：重复第一个字1次
        (word) => {
            const firstChar = word.charAt(0);
            return firstChar + '...' + word;
        },
        // 中度卡壳：重复第一个字2次
        (word) => {
            const firstChar = word.charAt(0);
            return firstChar + firstChar + '...' + word;
        },
        // 严重卡壳：重复整个词
        (word) => {
            return word + '...' + word;
        },
        // 犹豫型卡壳
        (word) => {
            return word.charAt(0) + '...呃...' + word.substring(1);
        }
    ];
    
    // 随机决定是否卡壳（30%概率）
    if (Math.random() < 0.3) {
        // 选择要卡壳的词（优先选择特定词，如果没有则随机选一个词）
        let targetWord = '';
        let targetIndex = -1;
        
        // 先检查是否有特定的卡壳词
        for (const word of stutterWords) {
            const index = result.indexOf(word);
            if (index !== -1) {
                targetWord = word;
                targetIndex = index;
                break;
            }
        }
        
        // 如果没有特定词，随机选择一个中文词
        if (!targetWord) {
            const words = result.match(/[\u4e00-\u9fa5]{2,}/g) || [];
            if (words.length > 0) {
                targetWord = words[Math.floor(Math.random() * words.length)];
                targetIndex = result.indexOf(targetWord);
            }
        }
        
        // 应用卡壳
        if (targetWord && targetIndex !== -1) {
            const pattern = stutterPatterns[Math.floor(Math.random() * stutterPatterns.length)];
            const stutteredWord = pattern(targetWord);
            result = result.substring(0, targetIndex) + stutteredWord + result.substring(targetIndex + targetWord.length);
            
            // 小概率双重卡壳
            if (Math.random() < 0.2) {
                const secondWords = result.match(/[\u4e00-\u9fa5]{2,}/g) || [];
                if (secondWords.length > 1) {
                    let secondWord;
                    do {
                        secondWord = secondWords[Math.floor(Math.random() * secondWords.length)];
                    } while (secondWord === targetWord);
                    
                    const secondIndex = result.indexOf(secondWord);
                    if (secondIndex !== -1 && Math.abs(secondIndex - targetIndex) > 10) {
                        const secondPattern = stutterPatterns[Math.floor(Math.random() * stutterPatterns.length)];
                        const secondStuttered = secondPattern(secondWord);
                        result = result.substring(0, secondIndex) + secondStuttered + result.substring(secondIndex + secondWord.length);
                    }
                }
            }
        }
    }
    
    return result;
}

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
        
        // 应用情绪化TTS处理
        let emotionalText = text;
        if (character_id) {
            emotionalText = processTextForTTS(text, character_id);
        }
        
        // 申公豹的随机卡壳效果（修复：提高基础语速）
        if (character_id === 'shengongbao') {
            // 随机决定是否卡壳（70%概率卡壳）
            if (Math.random() < 0.7) {
                // 随机选择卡壳位置
                const stutterWords = ['道友', '这个', '那个', '其实', '不过', '但是', '所以', '然后', '就是', '真的', '非常', '知道', '觉得'];
                const randomWord = stutterWords[Math.floor(Math.random() * stutterWords.length)];
                
                // 随机卡壳长度（1-3个点）
                const dotCount = Math.floor(Math.random() * 3) + 1;
                const dots = '.'.repeat(dotCount);
                
                // 修复：提高申公豹基础语速，卡壳时稍微减慢但不要太慢
                speedRatio *= (0.8 + Math.random() * 0.2); // 从0.6-0.8提高到0.8-1.0
                
                emotionalText = emotionalText.replace(new RegExp(randomWord, 'g'), 
                    randomWord.charAt(0) + dots + randomWord);
            }
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

app.listen(port, () => {
    console.log(`服务器启动成功: http://localhost:${port}`);
});