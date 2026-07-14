# CRC 算法关系演示器

交互式 CRC 教学工具，用同一组参数和输入同步展示逐位法、预异或法与查表法，帮助理解三种实现为什么在字节边界得到相同结果。

## 功能

- 内置 CRC-8/SMBUS、CRC-8/MAXIM-DOW、CRC-16/CCITT-FALSE、CRC-16/MODBUS。
- 支持 ASCII、HEX 输入以及 Width、Poly、Init、XorOut、RefIn/RefOut 自定义。
- 支持单步、播放、速度控制、伪代码、寄存器位级追踪。
- 可交互生成和检查 256 项 CRC 速查表。
- 全部计算在浏览器本地完成，不上传输入数据。

## 本地开发

```powershell
npm ci
npm run dev
```

提交前运行：

```powershell
npm test
npm run lint
npm run build
```

## 版本与发布

`package.json.version` 是页面版本徽标和发布标签校验的唯一版本来源。普通 main 提交只运行 CI，只有 `v*.*.*` 标签发布 GitHub Pages。

```powershell
npm version patch -m "chore(release): v%s"
git push origin main --follow-tags
```

新功能使用 `minor`，不兼容变化使用 `major`。标签不可移动或复用；回滚代码后发布新的 patch 版本。

线上地址：https://loogg.github.io/tool-crc-algorithm-lab/
