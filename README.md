# 跨文化理解答题网页

这是一个可直接部署到 GitHub Pages 的静态答题网页。学生打开网页后即可填写个人信息、在线作答，答案会自动保存在浏览器本地，并可导出为 `JSON` 文件提交给老师。

## 项目结构

- 前端目录：`web/`
- 题库文件：`web/data/questions.json`
- GitHub Pages 工作流：`.github/workflows/deploy-pages.yml`
- 本项目部署到 GitHub Pages 后不依赖 `server/server.py`

## 学生使用方式

1. 打开网页链接。
2. 填写姓名、学号、年龄、国籍、专业、学历层级、年级和起始题号。
3. 点击“开始答题”。
4. 完成后点击“完成并提交”。
5. 点击“下载答卷 JSON”，把下载后的文件提交给老师。

## 发布到 GitHub Pages

1. 把本目录推送到 GitHub 仓库的 `main` 分支。
2. 在 GitHub 仓库中打开 `Settings` -> `Pages`。
3. 在 `Build and deployment` 中选择 `GitHub Actions`。
4. 推送后等待 `Deploy GitHub Pages` 工作流完成。
5. 网站会发布到 GitHub Pages 提供的公开链接。

## 本地预览

建议从仓库根目录启动静态文件服务，例如：

```powershell
python -m http.server 8000
```

然后访问：

```text
http://127.0.0.1:8000/web/
```

## 说明

- 每次作答默认抽取 15 题。
- 系统会从起始题号开始选题，并跳过与学生“国籍”同名国家的题目。
- 自动保存存放在学生自己的浏览器 `localStorage` 中，换浏览器或清除浏览器数据后不会保留。
- 如需统一回收答案，需要学生下载 `JSON` 后再由老师收集，或后续接入真正的在线后端服务。
