# one.google.com /ai 只读诊断

独立的 Shadowrocket 实验脚本，只在本机判断入口有没有命中。

## 会记录什么

只处理 `https://one.google.com`（不写端口，或端口为 443），并且路径正好是 `/ai` 或 `/ai/`。

命中后写入本机 `$persistentStore`（键 `g1.diag.aiPath.v1`），只保存：

- 是否命中
- 固定路径分类：`/ai` 或 `/ai/`
- 这两类路径各自的本地次数

脚本日志也只有版本、是否命中、路径分类和次数。

## 不会做什么

- 不修改响应。任何情况都是 `$done({})`，原样放行。
- 不能改变订阅套餐或价格，也不能弹出或改写苹果内购。
- 不记录 query、Cookie、请求头、响应头、正文、账号、token 或商品值。
- 不发起网络请求，也不把记录外发。
- 没有改写开关，也没有可用参数打开改写。
- 模块若启用，MITM 只追加 `one.google.com`，不含 Apple 域名，不扩大其他域名，不含全局 UDP 拦截。
- 未经 iPhone、Gemini App 或实机 Shadowrocket 测试。看到 `/ai` 只表示脚本遇见了这个路径。

## 远程脚本

`script-path` 固定指向这次脚本提交，不使用相对路径：

https://cdn.jsdelivr.net/gh/xl7023aaa/sd@abd34bc3c3879705e7367c0faff9a00dd8d53b35/g1-ai-path-diag/g1-ai-path-diag.js

同一提交的 GitHub raw 地址：

https://raw.githubusercontent.com/xl7023aaa/sd/abd34bc3c3879705e7367c0faff9a00dd8d53b35/g1-ai-path-diag/g1-ai-path-diag.js

同目录的 `g1-ai-path-diag.sgmodule` 只追加 `one.google.com` 的 MITM。在 Shadowrocket 中导入下面这个固定提交的模块。本机仍需自行打开 HTTPS 解密并信任证书，脚本才看得到这个路径。

https://cdn.jsdelivr.net/gh/xl7023aaa/sd@6953906dd642c017f216e1145f9f27349f54d3c5/g1-ai-path-diag/g1-ai-path-diag.sgmodule

同一模块提交的 GitHub raw 地址：

https://raw.githubusercontent.com/xl7023aaa/sd/6953906dd642c017f216e1145f9f27349f54d3c5/g1-ai-path-diag/g1-ai-path-diag.sgmodule
