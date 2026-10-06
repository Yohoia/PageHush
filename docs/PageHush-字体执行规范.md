# PageHush 字体执行规范

PageHush 的字体系统遵循一个核心原则：

**宋体负责内容，Sans Serif 负责功能，Mono 负责代码。**

目标是让界面保持克制、安静和清晰，同时让文章内容具备明显的杂志感与文学气质。

## 1. 字体家族

中文品牌名、中文大标题、文章标题、文章正文：

`Noto Serif SC`

备用：

`Source Han Serif SC` / `思源宋体`

英文品牌名、英文大标题：

`Cormorant Garamond`

英文正文：

`Source Serif 4`

中文 UI：

`IBM Plex Sans SC`

英文 UI：

`Inter`

代码与 Markdown Code Block：

`IBM Plex Mono`

推荐字体栈：

```css
--font-serif-cn: "Noto Serif SC", "Source Han Serif SC", serif;
--font-serif-en: "Cormorant Garamond", "Source Serif 4", serif;
--font-body-en: "Source Serif 4", serif;

--font-sans:
  "Inter",
  "IBM Plex Sans SC",
  "PingFang SC",
  "Microsoft YaHei",
  sans-serif;

--font-mono:
  "IBM Plex Mono",
  "SFMono-Regular",
  Consolas,
  monospace;
```

## 2. 品牌字体

### 中文品牌名「页息」

字体：

`Noto Serif SC`

字重：

`500`

用于：

Logo Wordmark、品牌页、登录页、启动页、网站 Header。

不使用 Bold / 700 以上字重。

### 英文品牌名「PageHush」

字体：

`Cormorant Garamond`

字重：

`500`

推荐字距：

`0.04em – 0.08em`

英文品牌字应保持较大的呼吸感，不使用紧凑排版。

## 3. 页面主标题

用于：

文章标题、页面 Hero Title、重要 Editorial Heading。

中文：

```css
font-family: var(--font-serif-cn);
font-size: clamp(48px, 5vw, 80px);
font-weight: 500;
line-height: 1.12;
letter-spacing: -0.02em;
```

英文：

```css
font-family: var(--font-serif-en);
font-weight: 500;
line-height: 1.05;
letter-spacing: -0.02em;
```

主标题原则：

不加阴影。

不使用渐变文字。

不使用 700–900 超粗字重。

优先通过字号与留白建立视觉层级。

## 4. 文章正文

中文正文：

```css
font-family: var(--font-serif-cn);
font-size: 18px;
font-weight: 400;
line-height: 1.9;
letter-spacing: 0.01em;
```

桌面宽屏可使用：

`19–20px`

移动端建议：

`16–18px`

正文最大阅读宽度：

`620–720px`

单行不要过长。

英文正文使用：

`Source Serif 4`

正文不得使用 Inter 等 UI 字体代替。

## 5. H1 / H2 / H3

文章内部标题统一使用 Serif 字体。

### H1

```css
font-size: 40px;
font-weight: 500;
line-height: 1.25;
margin-top: 72px;
margin-bottom: 24px;
```

### H2

```css
font-size: 30px;
font-weight: 500;
line-height: 1.35;
margin-top: 56px;
margin-bottom: 20px;
```

### H3

```css
font-size: 24px;
font-weight: 500;
line-height: 1.4;
margin-top: 40px;
margin-bottom: 16px;
```

禁止通过高饱和颜色区分标题级别。

依靠：

字号、留白、字重。

## 6. UI 字体

以下内容统一使用 Sans Serif：

按钮  
Toolbar  
Menu  
Tooltip  
Dialog  
Input Label  
Placeholder  
状态信息  
字数统计  
保存状态  
快捷键提示  
设置界面

字体：

```css
font-family: var(--font-sans);
```

常规 UI：

```css
font-size: 14px;
font-weight: 400;
line-height: 1.5;
```

按钮：

```css
font-size: 14px;
font-weight: 500;
```

小型辅助信息：

```css
font-size: 12px;
font-weight: 400;
```

UI 字体不得使用宋体。

## 7. Tiptap Toolbar

Toolbar 使用：

`Inter / IBM Plex Sans SC`

按钮文字：

`13–14px`

字重：

`500`

Heading 下拉菜单中的：

正文  
H1  
H2  
H3

均使用 Sans Serif 展示。

编辑器内部真正渲染出的标题仍使用 Serif。

即：

**Toolbar 是功能层。**

**Document 是内容层。**

两者不得混淆。

## 8. Code / Markdown

Inline Code 与 Code Block：

```css
font-family: var(--font-mono);
```

Inline Code：

`0.9em`

Code Block：

`14–15px`

行高：

`1.7`

代码字体不使用衬线体。

## 9. Blockquote

引用继续使用 Serif。

推荐：

```css
font-family: var(--font-serif-cn);
font-size: 20px;
font-weight: 400;
line-height: 1.8;
font-style: normal;
```

可使用较浅文字颜色。

不要使用过度斜体。

中文正文默认不建议使用 Italic 作为主要强调方式。

## 10. 强调规则

正文强调优先级：

第一优先：

`font-weight: 500 / 600`

第二优先：

少量强调色。

第三优先：

Italic，仅主要用于英文。

避免：

粗体 + 彩色 + 下划线同时出现。

一次强调只使用一种主要手段。

## 11. 字重限制

全站建议只使用：

`400 Regular`

`500 Medium`

`600 Semibold`

尽量不要使用：

`700 Bold`

`800 ExtraBold`

`900 Black`

PageHush 不应该出现明显“粗黑标题”视觉。

## 12. 中英文混排

中文句子中出现英文时：

正文英文优先继承 `Source Serif 4`。

例如：

Markdown、Tiptap、PageHush 等。

UI 中的英文继承 `Inter`。

不要在同一个功能区域频繁切换 Serif / Sans。

## 13. 字号层级

全站控制在以下体系：

```text
12px  辅助信息
14px  UI / Button
16px  次级正文
18px  标准正文
20px  大正文 / Quote
24px  H3
30px  H2
40px  H1
48px  Page Title Small
64px  Hero Title
80px  Hero Title Large
```

避免随意出现：

17px、21px、27px、34px 等零散字号。

## 14. 行高规范

UI：

`1.4–1.5`

文章正文：

`1.8–2.0`

文章标题：

`1.05–1.4`

代码：

`1.6–1.7`

中文正文宁可略松，不要过紧。

## 15. 字距规范

中文正文：

`0–0.02em`

中文大标题：

`-0.02em – 0`

英文品牌：

`0.04em – 0.08em`

英文小型 Editorial Label：

`0.08em – 0.14em`

普通 UI：

`0`

不要给中文正文添加明显 Letter Spacing。

## 16. 禁止事项

禁止全站只使用 Inter。

禁止正文使用 UI Sans 字体。

禁止按钮使用宋体。

禁止出现超过三种主要字重。

禁止高频使用 Bold。

禁止为了“高级感”给所有英文都增加极大字距。

禁止为了“杂志感”牺牲正文可读性。

禁止一段内容同时混用多个 Serif 字体。

## 17. 最终实施规则

开发时直接按以下方式执行：

```text
Brand CN
Noto Serif SC Medium

Brand EN
Cormorant Garamond Medium

Article Title
Noto Serif SC Medium

Article Body CN
Noto Serif SC Regular

Article Body EN
Source Serif 4 Regular

UI CN
IBM Plex Sans SC

UI EN
Inter

Toolbar
Inter / IBM Plex Sans SC

Code
IBM Plex Mono
```

最终判断标准：

**所有与“阅读、写作、文章”相关的内容使用 Serif。**

**所有与“点击、操作、状态、导航”相关的内容使用 Sans Serif。**

**所有技术代码使用 Mono。**

如果某个元素不知道该用哪一种字体，先判断它是在“表达内容”，还是在“执行功能”。

表达内容 → Serif  
执行功能 → Sans Serif  
代码 → Mono
