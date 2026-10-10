# 采用 Tiptap 开源版作为编辑器基础

编辑器需要同时满足纸面化视觉定制与结构化内容块，且不依赖订阅服务。我们选择 Tiptap 开源核心 + 官方 Simple Editor 模板源码，而不是 CodeMirror（保真更好但产品交互需全部自建）或 MDXEditor（MDX 名称不等于任意 MDX 保真）。Markdown 扩展仍为 Beta，MDX 往返必须逐项验收，不能因依赖已安装就视为已支持。
