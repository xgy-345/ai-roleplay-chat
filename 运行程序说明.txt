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
