require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const app = express();
const port = process.env.PORT || 3000;
const QINIU_AI_API_KEY = process.env.QINIU_AI_API_KEY;
// --- 新增：智能记忆管理模块 ---
class ConversationMemory {
    constructor(maxTokens = 4000) {
        this.maxTokens = maxTokens;
        this.importantKeywords = new Set();
    }
    
    estimateTokens(text) {
        return Math.ceil(text.length * 0.75);
    }
    
    extractKeywords(messages) {
        const keywords = new Set();
        const recentText = messages.slice(-3).map(msg => msg.content).join(' ');
        
        const nounPatterns = [
            /(?:我想|我要|我喜欢|我讨厌)([^，。！？]+)/g,
            /(?:地点|位置|地方|城市)([^，。！？]+)/g,
            /(?:时间|时候|日期)([^，。！？]+)/g,
            /(?:人物|朋友|家人)([^，。！？]+)/g
        ];
        
        nounPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(recentText)) !== null) {
                if (match[1] && match[1].length > 1) {
                    keywords.add(match[1].trim());
                }
            }
        });
        
        return Array.from(keywords);
    }
    
    optimizeHistory(messages, currentFlow) {
        if (messages.length <= 8) return messages;
        
        const totalTokens = messages.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0);
        if (totalTokens <= this.maxTokens * 0.8) return messages;
        
        console.log(`[记忆管理] 开始优化，当前token: ${totalTokens}, 限制: ${this.maxTokens}`);
        
        const systemMessage = messages[0];
        const recentMessages = messages.slice(-6);
        const importantWords = this.extractKeywords(messages);
        
        const importantMessages = messages.filter((msg, index) => {
            if (index === 0) return true;
            if (index >= messages.length - 6) return true;
            return importantWords.some(word => msg.content.includes(word));
        });
        
        const optimizedHistory = [systemMessage];
        const seenIndices = new Set();
        
        [...importantMessages, ...recentMessages].forEach(msg => {
            const index = messages.indexOf(msg);
            if (index !== -1 && !seenIndices.has(index)) {
                optimizedHistory.push(msg);
                seenIndices.add(index);
            }
        });
        
        if (optimizedHistory.length > 12) {
            return [systemMessage, ...messages.slice(-10)];
        }
        
        console.log(`[记忆管理] 优化完成: ${messages.length} -> ${optimizedHistory.length} 条消息`);
        return optimizedHistory;
    }
}

const memoryManager = new ConversationMemory();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '')));
// --- 新增：才艺检测和处理函数 ---
function detectAndHandleTalentRequest(characterId, userMessage, currentSystemPrompt) {
    const characterTalents = {
        kiana: {
            name: "讲故事",
            triggerWords: ["讲故事", "讲个故事", "表演才艺", "来段故事", "说个故事"]
        },
        shengongbao: {
            name: "绕口令", 
            triggerWords: ["绕口令", "说段绕口令", "表演才艺", "来段绕口令"]
        },
        zeus: {
            name: "哲学名言",
            triggerWords: ["歇后语", "哲学", "名言", "表演才艺", "说句有哲理的话"]
        }
    };
    
    const talent = characterTalents[characterId];
    if (!talent) return currentSystemPrompt;
    
    // 检查用户消息是否包含才艺触发词
    const hasTalentRequest = talent.triggerWords.some(word => 
        userMessage.includes(word)
    );
    
    if (hasTalentRequest) {
        console.log(`[才艺系统] ${characterId} 触发才艺表演: ${talent.name}`);
        
        const talentPrompts = {
            kiana: `
【才艺表演指令】: 用户要求你表演才艺（讲故事）。请即兴创作一个简短生动有趣的故事，故事可以关于：
- 女武神的冒险经历和战斗故事
- 与伙伴们的日常趣事
- 关于美食的奇妙遭遇（特别是披萨）
- 自创的童话或寓言故事

要求：故事要简短（3-6句话），要有完整的情节和趣味性，体现琪亚娜活泼可爱的性格。可以在故事前后加上一些可爱的评论和互动。`,
            
            shengongbao: `
【才艺表演指令】: 用户要求你表演才艺（绕口令）。请创作一段富有道家哲理的绕口令，内容可以涉及：
- 阴阳五行相生相克
- 命运和因果循环
- 修炼和得道成仙
- 带有你狡猾特点的双关语

要求：绕口令要有一定的难度，但不能读的很顺畅。要体现结巴与绕口令的对抗感，最好每句都卡壳一下，但别都在开头卡壳。可以说完后加上一些意味深长的评论。`,
            
            zeus: `
【才艺表演指令】: 用户要求你表演才艺（哲学名言/歇后语）。请说出富有神王威严的哲学思考或歇后语，内容可以关于：
- 神权与凡人的关系
- 雷霆和天空的象征意义
- 权力和责任的哲学思考
- 对凡人愚蠢行为的讽刺

要求：语句要简短有力，充满威严，体现宙斯的高傲和对凡人的蔑视。可以说完后用居高临下的态度点评一番。`
        };
        
        return currentSystemPrompt + (talentPrompts[characterId] || '');
    }
    
    return currentSystemPrompt;
}
// --- 新增：角色技能系统 ---
class CharacterSkills {
    constructor() {
        this.skills = {
            kiana: {
                name: "女武神的直觉",
                description: "能感知用户的情绪状态并相应调整对话",
                cooldown: 3,
                lastTrigger: 0
            },
            shengongbao: {
                name: "蛊惑人心", 
                description: "在对话中随机插入暗示性话语，引导用户思维",
                cooldown: 2,
                lastTrigger: 0
            },
            zeus: {
                name: "神之洞察",
                description: "能发现对话中的矛盾点并指出来",
                cooldown: 4,
                lastTrigger: 0
            }
        };
    }

    // 琪亚娜技能：情绪感知
    kianaSkill(messages, currentFlow) {
        const userMessages = messages.filter(msg => msg.role === "user");
        if (userMessages.length === 0) return null;

        const lastUserMessage = userMessages[userMessages.length - 1].content;
        const messageCount = userMessages.length;
        
        if (messageCount - this.skills.kiana.lastTrigger < this.skills.kiana.cooldown) {
            return null;
        }

        const positiveWords = ['开心', '高兴', '喜欢', '爱', '棒', '好', '厉害'];
        const negativeWords = ['难过', '伤心', '生气', '讨厌', '糟糕', '不好', '烦'];
        const questionWords = ['为什么', '怎么', '如何', '?', '？'];

        let emotion = 'neutral';
        if (positiveWords.some(word => lastUserMessage.includes(word))) {
            emotion = 'positive';
        } else if (negativeWords.some(word => lastUserMessage.includes(word))) {
            emotion = 'negative';
        } else if (questionWords.some(word => lastUserMessage.includes(word))) {
            emotion = 'curious';
        }

        const skillPrompts = {
            positive: "【情绪感知】你察觉到用户心情很好，请用更加活泼开心的语气回应，可以分享一个有趣的小故事或笑话。",
            negative: "【情绪感知】你感觉到用户情绪有些低落，请用温暖安慰的语气回应，表达关心和支持。",
            curious: "【情绪感知】用户表现出强烈的好奇心，请用详细耐心的方式解答，可以适当扩展相关知识。",
            neutral: "【情绪感知】用户情绪平稳，请用你标志性的元气满满的方式继续对话。"
        };

        if (skillPrompts[emotion]) {
            this.skills.kiana.lastTrigger = messageCount;
            return skillPrompts[emotion];
        }

        return null;
    }

    // 申公豹技能：心理暗示
    shengongbaoSkill(messages, currentFlow) {
        const messageCount = messages.filter(msg => msg.role === "user").length;
        
        if (messageCount - this.skills.shengongbao.lastTrigger < this.skills.shengongbao.cooldown) {
            return null;
        }

        if (Math.random() > 0.3) return null;

        const hints = [
            "【蛊惑人心】在回复中巧妙地暗示'命运的安排'或'天意的指引'，让用户觉得你们的相遇是注定的。",
            "【蛊惑人心】用反问的方式引导用户思考，例如'道友不觉得这一切太过巧合了吗？'",
            "【蛊惑人心】暗示用户当前的选择可能不是最优的，用'或许另有蹊径'这样的模糊说法。"
        ];

        const selectedHint = hints[Math.floor(Math.random() * hints.length)];
        this.skills.shengongbao.lastTrigger = messageCount;
        return selectedHint;
    }

    // 宙斯技能：逻辑洞察
    zeusSkill(messages, currentFlow) {
        const userMessages = messages.filter(msg => msg.role === "user");
        if (userMessages.length < 2) return null;

        const messageCount = userMessages.length;
        
        if (messageCount - this.skills.zeus.lastTrigger < this.skills.zeus.cooldown) {
            return null;
        }

        const recentUserMessages = userMessages.slice(-3).map(msg => msg.content);
        let insight = null;

        if (recentUserMessages.length >= 2) {
            const lastMessage = recentUserMessages[recentUserMessages.length - 1].toLowerCase();
            const secondLastMessage = recentUserMessages[recentUserMessages.length - 2].toLowerCase();

            if ((lastMessage.includes('喜欢') && secondLastMessage.includes('讨厌')) ||
                (lastMessage.includes('同意') && secondLastMessage.includes('反对'))) {
                insight = "【神之洞察】你注意到用户的态度似乎发生了变化，请以神明的智慧指出这种矛盾。";
            }
            else if (lastMessage.includes('昨天') && secondLastMessage.includes('明天')) {
                insight = "【神之洞察】你发现用户的时间描述存在混乱，请以威严的语气指出这一点。";
            }
        }

        if (!insight && Math.random() > 0.7) {
            const generalInsights = [
                "【神之洞察】以神明的视角对用户的凡人思维进行一番点评，指出其局限性。",
                "【神之洞察】用奥林匹斯山的例子来对比用户提到的事情，展现神界的优越性。"
            ];
            insight = generalInsights[Math.floor(Math.random() * generalInsights.length)];
        }

        if (insight) {
            this.skills.zeus.lastTrigger = messageCount;
            return insight;
        }

        return null;
    }

    checkSkills(characterId, messages, currentFlow) {
        const skills = {
            'kiana': () => this.kianaSkill(messages, currentFlow),
            'shengongbao': () => this.shengongbaoSkill(messages, currentFlow),
            'zeus': () => this.zeusSkill(messages, currentFlow)
        };

        if (skills[characterId]) {
            return skills[characterId]();
        }
        return null;
    }

    getSkillDescription(characterId) {
        if (this.skills[characterId]) {
            return {
                name: this.skills[characterId].name,
                description: this.skills[characterId].description
            };
        }
        return null;
    }
}

const skillManager = new CharacterSkills();

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
        let voiceType = tts_config.voice_type || 'qiniu_zh_male_wncwxz';
        let speedRatio = tts_config.speed_ratio || 1.1;
        let volume = 1.0; // 默认音量
        let pitch = 0; // 默认音调
    
        let emotionalText = text;
      
        // 申公豹的随机卡壳效果
        if (character_id === 'shengongbao') {emotionalText = addRandomStutter(emotionalText);}
        if (character_id === 'zeus') {emotionalText = enhanceZeusTextForTTS(emotionalText);}
    
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
                speed_ratio: speedRatio,
                volume: volume, // +++ 新增音量参数 +++
                pitch: pitch    // +++ 新增音调参数 +++
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
        const { chatHistory, enhance_interaction = false, conversation_flow, current_character } = req.body;

        console.log('[CHAT] 收到请求，消息数量:', chatHistory?.length || 0, '对话流:', conversation_flow);

        if (!chatHistory || !Array.isArray(chatHistory)) {
            return res.status(400).json({ 
                error: { 
                    message: 'chatHistory必须是数组',
                    code: 'INVALID_CHAT_HISTORY'
                } 
            });
        }

        // 1. 智能记忆管理：优化对话历史
        const optimizedHistory = memoryManager.optimizeHistory(chatHistory, conversation_flow);
    
        // 2. 增强互动性逻辑
        let enhancedMessages = [...optimizedHistory];
        // 获取最后一条用户消息
        const userMessages = optimizedHistory.filter(msg => msg.role === "user");
        const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : "";
        // 检测并处理才艺请求
        if (lastUserMessage && current_character) {
            const systemMessage = enhancedMessages[0];
            const enhancedSystemPrompt = detectAndHandleTalentRequest(current_character, lastUserMessage, systemMessage.content);
            
            if (enhancedSystemPrompt !== systemMessage.content) {
                enhancedMessages[0] = {
                    ...systemMessage,
                    content: enhancedSystemPrompt
                };
                console.log(`[才艺系统] ${current_character} 才艺指令已添加`);
            }
        }
        if (conversation_flow === "NEED_PROMPT") {
            const systemMessage = enhancedMessages[0];
            enhancedMessages[0] = {
                ...systemMessage,
                content: systemMessage.content + "\n\n【当前任务】: 用户似乎不知道说什么，请主动介绍自己并提一个开放式问题来引导对话。"
            };
        } else if (conversation_flow === "NEED_TOPIC_CHANGE") {
            const systemMessage = enhancedMessages[0];
            enhancedMessages[0] = {
                ...systemMessage,
                content: systemMessage.content + `\n\n【当前任务】: 对话陷入僵局，请主动提出一个新话题。根据角色性格选择话题：${current_character === 'kiana' ? '美食、冒险' : current_character === 'shengongbao' ? '命运、修行' : '神力、神话'}。`
            };
        } else if (conversation_flow === "NEED_INITIATIVE") {
            const systemMessage = enhancedMessages[0];
            enhancedMessages[0] = {
                ...systemMessage,
                content: systemMessage.content + "\n\n【当前任务】: 用户回答简短，请主动延伸话题或提出相关问题。"
            };
        }
        // 角色技能触发检查
        const skillPrompt = skillManager.checkSkills(current_character, enhancedMessages, conversation_flow);
if (skillPrompt) {
    console.log(`[技能系统] ${current_character} 触发技能:`, skillPrompt);
    const systemMessage = enhancedMessages[0];
    enhancedMessages[0] = {...systemMessage,
        content: systemMessage.content + '\n\n' + skillPrompt
    };
}

        const requestBody = {
            model: "deepseek-v3",
            messages: enhancedMessages,
            stream: false,
            temperature: conversation_flow === "NEED_TOPIC_CHANGE" ? 0.8 : 0.7,
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
// --- 获取角色技能信息API ---
app.get('/api/character/:id/skill', (req, res) => {
    const characterId = req.params.id;
    const skillInfo = skillManager.getSkillDescription(characterId);
    
    if (skillInfo) {
        res.json({
            success: true,
            skill: skillInfo
        });
    } else {
        res.status(404).json({
            success: false,
            error: '未找到该角色的技能信息'
        });
    }
});
// --- 优化版：申公豹卡壳机制 ---
function addRandomStutter(text) {
    if (text.length < 3) return text;
    
    // 中文句子分隔符
    const sentenceEnders = /[。！？；]/;
    const punctuation = /[，。！？；：""''《》()【】]/;
    
    // 分割成句子
    const sentences = [];
    let currentSentence = '';
    
    for (let i = 0; i < text.length; i++) {
        currentSentence += text[i];
        if (sentenceEnders.test(text[i]) || i === text.length - 1) {
            sentences.push(currentSentence);
            currentSentence = '';
        }
    }
    if (currentSentence) sentences.push(currentSentence);
    
    // 处理每个句子
    const processedSentences = sentences.map(sentence => {
        // 70%概率卡壳
        if (Math.random() > 0.7) return sentence;
        
        // 获取可卡壳的位置（非标点、非句子末尾）
        const candidatePositions = [];
        const chars = sentence.split('');
        
        for (let i = 0; i < chars.length - 1; i++) {
            const currentChar = chars[i];
            const nextChar = chars[i + 1];
            
            // 排除条件：标点符号、连续卡壳位置、句子末尾
            if (!punctuation.test(currentChar) && 
                !punctuation.test(nextChar) &&
                (i === 0 || !candidatePositions.includes(i - 1))) {
                candidatePositions.push(i);
            }
        }
        
        if (candidatePositions.length === 0) return sentence;
        
        // 随机选择卡壳位置
        const stutterPos = candidatePositions[Math.floor(Math.random() * candidatePositions.length)];
        
        // 生成卡壳效果
        const stutterChar = chars[stutterPos];
        const repeatCount = Math.floor(Math.random() * 3) + 2; // 2-4次重复（1-5次包含原字）
        
        // 创建自然结巴效果：随机间隔和音调变化
        let stutterPattern = '';
        let remainingRepeats = repeatCount;
        
        while (remainingRepeats > 0) {
            const currentRepeats = Math.min(Math.floor(Math.random() * 2) + 1, remainingRepeats);
            
            // 添加重复字符
            stutterPattern += stutterChar.repeat(currentRepeats);
            remainingRepeats -= currentRepeats;
            
            // 添加随机停顿（概率性）
            if (remainingRepeats > 0 && Math.random() > 0.4) {
                const pauseDots = Math.floor(Math.random() * 2) + 1; // 1-2个点
                stutterPattern += '…'.repeat(pauseDots);
            }
        }
        
        // 替换原字符
        chars[stutterPos] = stutterPattern;
        return chars.join('');
    });
    
    return processedSentences.join('');
}
// --- 新增：宙斯语音增强函数 ---
function enhanceZeusTextForTTS(text) {
    let enhancedText = text;
    
    // 1. 为关键词语添加强调（通过重复或标点）
    const emphasisWords = ['凡人', '蝼蚁', '愚蠢', '大胆', '雷霆', '神力'];
    emphasisWords.forEach(word => {
        const regex = new RegExp(word, 'g');
        enhancedText = enhancedText.replace(regex, `${word}！`);
    });
    
    // 2. 在句子结尾添加更强的语气
    enhancedText = enhancedText.replace(/[。]/g, '！'); // 句号变感叹号
    enhancedText = enhancedText.replace(/[？]/g, '？！'); // 问号加强
    
    // 3. 随机添加愤怒的语气词
    const angerExclamations = ['哼！', '呵！', '哈！', '呸！', '哼哼！'];
    const sentences = enhancedText.split(/[。！？]/);
    if (sentences.length > 1 && Math.random() > 0.6) {
        const randomExclamation = angerExclamations[Math.floor(Math.random() * angerExclamations.length)];
        // 在句子开头或中间插入语气词
        const insertPosition = Math.max(1, Math.floor(sentences.length * 0.3));
        sentences.splice(insertPosition, 0, randomExclamation);
        enhancedText = sentences.join('');
    }
    
    // 4. 为命令式语句添加强调
    if (enhancedText.includes('！') && !enhancedText.includes('……')) {
        // 在感叹句后添加强调停顿
        enhancedText = enhancedText.replace(/！/g, '！……');
    }
    
    return enhancedText;
}


app.listen(port, () => {
    console.log(`服务器启动成功: http://localhost:${port}`);
});