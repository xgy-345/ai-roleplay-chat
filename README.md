一 系统要求
1.硬件要求：
内存：至少 2GB
硬盘空间：至少 200MB 可用空间
麦克风（用于语音输入）
扬声器/耳机（用于语音输出）
2.软件要求：
Node.js 18.0 或更高版本
现代浏览器（Chrome 90+、Firefox 88+、Edge 90+）
稳定的网络连接
二 安装步骤
1.环境准备
bash
# 检查Node.js版本
node --version
# 应该显示 v18.0.0 或更高版本
# 如果未安装Node.js，请从 nodejs.org 下载安装
2.获取代码
# 将项目文件放在一个目录中，确保包含：
# - images文件夹（包含三张png图片）
# - index.html
# - server.js  
# - package.json
# - package-lock.json
# - .env 文件
3.配置环境变量(提供在.env文件里了，可省略)
创建 .env 文件并添加七牛云API密钥：
QINIU_AI_API_KEY=您的七牛云API密钥
PORT=3000  # 可选，默认3000
4.安装依赖
# 在项目根目录执行
npm install
三 运行程序
1.启动服务器
# 开发模式
npm start
# 或者直接运行
node server.js
# 非开发模式
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
再实行 npm start或node server.js
2.使用应用
搜索角色
选择角色
选择输入方式：文本输入或语音输入
开始对话，AI角色会语音回复
四 故障排除
常见问题1：缺少API密钥
错误：QINIU_AI_API_KEY is not defined
解决方案：检查.env文件是否正确配置
常见问题2：头像无法显示
解决方案：确保images目录包含对应的PNG文件
或使用网络头像链接
常见问题3：语音识别不工作
解决方案：使用浏览器时，确保授予麦克风权限


架构设计

前端模块 (index.html)
1. UI管理模块
角色搜索界面
角色选择界面
聊天界面切换
消息气泡显示
响应式布局适配

2. 语音处理模块
Web Speech API 语音识别
音频播放控制
实时录音状态管理

3. 通信模块
RESTful API 调用封装
错误处理和重试机制
实时状态更新

后端模块 (server.js)

1. API网关层
Express 路由管理
请求验证和过滤
CORS 和安全性处理

2. 智能对话引擎
javascript
class ConversationMemory {
  // 对话记忆管理
  optimizeHistory()    // 历史记录优化
  extractKeywords()    // 关键词提取
  estimateTokens()     // Token数量估算
}

3. 角色技能系统
javascript
class CharacterSkills {
  // 角色专属技能
  kianaSkill()        // 情绪感知
  shengongbaoSkill()  // 心理暗示  
  zeusSkill()         // 逻辑洞察
}

4. TTS服务层
七牛云TTS服务集成
语音参数个性化配置
备用浏览器TTS方案

数据流设计
用户对话流程：用户输入 → 语音识别 → 文本处理 → 对话记忆优化 → AI模型推理 → 回复生成 → TTS语音合成 → 音频播放

API调用序列
聊天API (POST /api/chat)

javascript
{
  chatHistory: Array,           // 对话历史
  enhance_interaction: Boolean, // 增强交互标志
  conversation_flow: String,    // 对话流分析
  current_character: String     // 当前角色
}

TTS API (POST /api/tts)
javascript
{
  text: String,                 // 要合成的文本
  tts_config: Object,           // 语音配置
  character_id: String          // 角色ID
}

关键技术选型
前端框架	HTML/CSS/JS	
后端框架	Express.js	
AI服务	   七牛云DeepSeek-v3模型	
语音合成    七牛云TTS服务
语音识别	Web Speech API	
音频播放	Web Audio API	

系统特色功能
1. 智能记忆管理
动态对话历史优化
关键词提取和记忆保留
Token数量智能控制

2. 角色个性化
不同语音特征（语速、音调）
角色特定技能系统
个性化对话风格
