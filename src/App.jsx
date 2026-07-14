import { useEffect, useMemo, useState } from "react";
import { Github } from "lucide-react";
import { PRESETS, buildTable, hex, lookupTrace, makeFrames, maskFor, parseBytes, reflectPoly } from "./crc.js";

function Register({ value, width, edge, highlightBit, accent = "blue" }) {
  const bits = Array.from({ length: width }, (_, index) => (value >>> (width - 1 - index)) & 1);
  return (
    <div className={`register register-${accent}`} aria-label={`${width} 位寄存器，当前值 ${hex(value, width)}`}>
      {bits.map((bit, index) => (
        <span key={index} className={`${(edge === "left" && index === 0) || (edge === "right" && index === width - 1) ? "edge-bit" : ""} ${highlightBit === width - 1 - index ? "active-data-bit" : ""}`}>
          <small>{width - 1 - index}</small>{bit}
        </span>
      ))}
    </div>
  );
}

function RegisterRow({ label, note, value, width, accent = "blue", edge, highlightBit }) {
  return (
    <div className="register-row">
      <div className="register-label"><b>{label}</b>{note && <small>{note}</small>}</div>
      <Register value={value} width={width} accent={accent} edge={edge} highlightBit={highlightBit} />
      <code>{hex(value, width)}</code>
    </div>
  );
}


export default function App() {
  const [presetId, setPresetId] = useState("crc8");
  const preset = PRESETS.find((item) => item.id === presetId) ?? PRESETS[0];
  const [width, setWidth] = useState(preset.width);
  const [polyText, setPolyText] = useState(hex(preset.poly, preset.width));
  const [initText, setInitText] = useState(hex(preset.init, preset.width));
  const [xorText, setXorText] = useState(hex(preset.xorOut, preset.width));
  const [refin, setRefin] = useState(preset.refin);
  const [mode, setMode] = useState("ascii");
  const [input, setInput] = useState("123456789");
  const [frameIndex, setFrameIndex] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [buildIndex, setBuildIndex] = useState(1);
  const [buildStep, setBuildStep] = useState(0);
  const [activeAlgorithm, setActiveAlgorithm] = useState("direct");
  const [showPseudo, setShowPseudo] = useState(false);

  const poly = Number.parseInt(polyText.replace(/^0x/i, ""), 16) & maskFor(width);
  const init = Number.parseInt(initText.replace(/^0x/i, ""), 16) & maskFor(width);
  const xorOut = Number.parseInt(xorText.replace(/^0x/i, ""), 16) & maskFor(width);
  const bytes = useMemo(() => parseBytes(input, mode), [input, mode]);
  const table = useMemo(() => buildTable(width, poly, refin), [width, poly, refin]);
  const frames = useMemo(() => makeFrames(bytes, width, poly, init, refin, table), [bytes, width, poly, init, refin, table]);
  const safeIndex = Math.min(frameIndex, frames.length - 1);
  const frame = frames[safeIndex];
  const result = (frames.at(-1)?.direct ?? init) ^ xorOut;
  const checkMatches = input === "123456789" && mode === "ascii" && result === preset.check;

  useEffect(() => {
    // 参数或输入改变后，教学动画必须回到新数据的第一个字节。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrameIndex(bytes.length ? 1 : 0);
    setPlaying(false);
  }, [input, mode, width, poly, init, xorOut, refin, bytes.length]);

  useEffect(() => {
    if (!playing) return;
    if (safeIndex >= frames.length - 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setFrameIndex((index) => Math.min(index + 1, frames.length - 1)), speed);
    return () => window.clearTimeout(timer);
  }, [playing, safeIndex, frames.length, speed]);

  const applyPreset = (id) => {
    const next = PRESETS.find((item) => item.id === id) ?? PRESETS[0];
    setPresetId(id);
    setWidth(next.width);
    setPolyText(hex(next.poly, next.width));
    setInitText(hex(next.init, next.width));
    setXorText(hex(next.xorOut, next.width));
    setRefin(next.refin);
  };

  const isByteDone = frame.type === "bit" && frame.bitIndex === 7;
  const runtimeTableIndex = frame.tableIndex;
  const workingPoly = refin ? reflectPoly(poly, width) : poly;
  const directEdge = refin ? frame.directBefore & 1 : (frame.directBefore >>> (width - 1)) & 1;
  const directShifted = refin ? frame.directBefore >>> 1 : (frame.directBefore << 1) & maskFor(width);
  const preEdge = refin ? frame.preBefore & 1 : (frame.preBefore >>> (width - 1)) & 1;
  const preShifted = refin ? frame.preBefore >>> 1 : (frame.preBefore << 1) & maskFor(width);
  const tableEdgeByte = refin ? frame.tableBefore & 0xff : (frame.tableBefore >>> (width - 8)) & 0xff;
  const tableCarry = refin ? frame.tableBefore >>> 8 : (frame.tableBefore << 8) & maskFor(width);
  const trace = lookupTrace(buildIndex, width, poly, refin);
  const traceStep = trace[buildStep];
  const dataBitPosition = frame.type === "bit" ? (refin ? frame.bitIndex : 7 - frame.bitIndex) : undefined;
  const alignedData = refin ? frame.dataByte : (frame.dataByte << (width - 8)) & maskFor(width);
  const directPolyOperand = frame.polyApplied ? workingPoly : 0;
  const prePolyOperand = preEdge ? workingPoly : 0;
  const tracePolyOperand = traceStep.edge ? workingPoly : 0;
  const pseudoCode = activeAlgorithm === "direct"
    ? `for each byte:\n  for bit in byte (${refin ? "LSB → MSB" : "MSB → LSB"}):\n    feedback = ${refin ? "lsb" : "msb"}(crc) ^ bit\n    crc = (crc ${refin ? ">>" : "<<"} 1) & MASK\n    if feedback == 1:\n      crc = crc ^ ${hex(workingPoly, width)}`
    : activeAlgorithm === "pre"
      ? `for each byte:\n  crc = crc ^ ${refin ? "byte" : "(byte << (WIDTH - 8))"}\n  repeat 8 times:\n    feedback = ${refin ? "lsb" : "msb"}(crc)\n    crc = (crc ${refin ? ">>" : "<<"} 1) & MASK\n    if feedback == 1:\n      crc = crc ^ ${hex(workingPoly, width)}`
      : `# ① 建立全部 256 个表项\nfor index = 0 .. 255:\n  r = ${refin ? "index" : "index << (WIDTH - 8)"}\n  repeat 8 times:\n    edge = ${refin ? "lsb" : "msb"}(r)\n    r = (r ${refin ? ">>" : "<<"} 1) & MASK\n    if edge == 1:\n      r = r ^ ${hex(workingPoly, width)}\n  table[index] = r\n\n# ② 运行时处理数据\nfor each byte:\n  index = ${refin ? "low8" : "high8"}(crc) ^ byte\n  crc = ${refin ? "(crc >> 8)" : "((crc << 8) & MASK)"}\n        ^ table[index]`;
  const phaseLabel = frame.type === "initial" ? "准备开始"
    : frame.type === "byteStart" ? `装入第 ${frame.byteIndex + 1} 字节`
    : frame.type === "final" ? "计算完成"
    : `第 ${frame.byteIndex + 1} 字节 ${hex(frame.dataByte, 8)} · data[${dataBitPosition}] = ${frame.dataBit} · 第 ${frame.bitIndex + 1}/8 步`;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CRC Lab 首页">
          <span className="brand-mark">C</span>
          <span>CRC LAB</span>
          <span className="version-badge">v{import.meta.env.APP_VERSION}</span>
        </a>
        <div className="header-actions">
          <div className="header-note"><span className="live-dot" /> 逐位可观测 · 参数可扩展</div>
          <a className="github-link" href="https://github.com/loogg/tool-crc-algorithm-lab" target="_blank" rel="noreferrer" aria-label="打开 GitHub 仓库">
            <Github size={17} />
            <span>GitHub</span>
          </a>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">INTERACTIVE CRC EXPLAINER</p>
          <h1>一个结果，<em>三条路径。</em></h1>
          <p className="hero-copy">把逐位算法展开、把预异或法对齐、再看查表法如何将 8 次循环压缩成一次索引。</p>
        </div>
        <div className="result-panel">
          <span>当前 CRC</span>
          <strong>{hex(result, width)}</strong>
          <small className={checkMatches ? "check-ok" : ""}>{checkMatches ? `✓ 与标准校验值 ${hex(preset.check, width)} 一致` : `${bytes.length} 字节 · ${width} 位寄存器`}</small>
        </div>
      </section>

      <nav className="learning-rail" aria-label="CRC 学习路线">
        <a href="#parameters"><b>1</b><span>认清参数<small>Poly · Init · RefIn</small></span></a>
        <i>→</i><a href="#algorithm-lab"><b>2</b><span>跑通逐位法<small>看懂每一个 bit</small></span></a>
        <i>→</i><a href="#algorithm-lab"><b>3</b><span>理解等价变形<small>预异或重排顺序</small></span></a>
        <i>→</i><a href="#table-lab"><b>4</b><span>亲手建立查表<small>256 × 8 次预计算</small></span></a>
      </nav>

      <section className="config card" id="parameters">
        <div className="section-title">
          <div><span className="step-badge">01</span><h2>选择实验参数</h2></div>
          <p>多项式填写时不包含最高次项；反射算法会自动换成镜像多项式参与右移计算。</p>
        </div>
        <div className="config-grid">
          <label className="field field-wide">
            <span>算法预设</span>
            <select aria-label="算法预设" value={presetId} onChange={(event) => applyPreset(event.target.value)}>
              {PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>宽度</span>
            <select aria-label="CRC 宽度" value={width} onChange={(event) => { setPresetId("custom"); setWidth(Number(event.target.value)); }}>
              <option value={8}>8 bit</option><option value={16}>16 bit</option>
            </select>
          </label>
          <label className="field"><span>Poly</span><input value={polyText} onChange={(event) => { setPresetId("custom"); setPolyText(event.target.value); }} /></label>
          <label className="field"><span>Init</span><input value={initText} onChange={(event) => { setPresetId("custom"); setInitText(event.target.value); }} /></label>
          <label className="field"><span>XorOut</span><input value={xorText} onChange={(event) => { setPresetId("custom"); setXorText(event.target.value); }} /></label>
          <label className="toggle-field">
            <input type="checkbox" checked={refin} onChange={(event) => { setPresetId("custom"); setRefin(event.target.checked); }} />
            <span className="toggle" />
            <span><b>RefIn / RefOut</b><small>{refin ? "LSB first · 右移" : "MSB first · 左移"}</small></span>
          </label>
        </div>
        <div className="data-row">
          <div className="segmented" aria-label="输入格式">
            <button className={mode === "ascii" ? "active" : ""} onClick={() => { setMode("ascii"); setInput("123456789"); }}>ASCII</button>
            <button className={mode === "hex" ? "active" : ""} onClick={() => { setMode("hex"); setInput("31 32 33 34 35 36 37 38 39"); }}>HEX</button>
          </div>
          <label className="data-input"><span>输入数据</span><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={mode === "ascii" ? "123456789" : "31 32 33"} /></label>
          <div className="byte-preview" aria-label="解析后的字节">
            {bytes.slice(0, 12).map((byte, index) => <span key={`${byte}-${index}`} className={frame.byteIndex === index ? "current" : ""}>{hex(byte, 8, false)}</span>)}
            {bytes.length > 12 && <span>+{bytes.length - 12}</span>}
          </div>
        </div>
        <div className="concept-strip" aria-label="CRC 概念速查">
          <span><b>⊕ XOR</b><small>相同为 0，不同为 1</small></span>
          <span><b>MSB / LSB</b><small>最高位 / 最低位</small></span>
          <span><b>Poly</b><small>反馈位为 1 时使用的异或模板</small></span>
          <span><b>Init</b><small>处理第一个字节前的 CRC 初值</small></span>
          <span><b>RefIn</b><small>决定数据顺序和移位方向</small></span>
        </div>
      </section>

      <section className="lab-section" id="algorithm-lab">
        <div className="section-title">
          <div><span className="step-badge">02</span><h2>让三种算法同步前进</h2></div>
          <p>在字节边界，三者必然汇合；字节内部，灰色掩码解释了中间值为何看似不同。</p>
        </div>

        <div className="transport card">
          <div className="transport-state"><span>{phaseLabel}</span><strong>{safeIndex} / {frames.length - 1}</strong></div>
          <input aria-label="计算进度" type="range" min={0} max={frames.length - 1} value={safeIndex} onChange={(event) => { setFrameIndex(Number(event.target.value)); setPlaying(false); }} />
          <div className="transport-buttons">
            <button onClick={() => { setFrameIndex(0); setPlaying(false); }}>复位</button>
            <button onClick={() => { setFrameIndex((index) => Math.max(0, index - 1)); setPlaying(false); }}>上一步</button>
            <button className="primary" onClick={() => { if (safeIndex >= frames.length - 1) setFrameIndex(0); setPlaying((value) => !value); }}>{playing ? "暂停" : "播放"}</button>
            <button onClick={() => { setFrameIndex((index) => Math.min(frames.length - 1, index + 1)); setPlaying(false); }}>下一步</button>
          </div>
          <label className="speed">速度 <select aria-label="动画速度" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1200}>慢</option><option value={700}>正常</option><option value={280}>快</option></select></label>
        </div>

        <div className="algorithm-tabs" role="tablist" aria-label="选择要详细观察的算法">
          <button role="tab" aria-selected={activeAlgorithm === "direct"} className={activeAlgorithm === "direct" ? "active direct" : ""} onClick={() => { setActiveAlgorithm("direct"); setShowPseudo(false); }}><b>① 逐位算法</b><span>数据 bit 与 CRC 边缘位相遇</span></button>
          <button role="tab" aria-selected={activeAlgorithm === "pre"} className={activeAlgorithm === "pre" ? "active pre" : ""} onClick={() => { setActiveAlgorithm("pre"); setShowPseudo(false); }}><b>② 预异或法</b><span>先合并整个字节，再移位</span></button>
          <button role="tab" aria-selected={activeAlgorithm === "table"} className={activeAlgorithm === "table" ? "active table" : ""} onClick={() => { setActiveAlgorithm("table"); setShowPseudo(false); }}><b>③ 查表法</b><span>把八次移位提前算好</span></button>
        </div>

        <div className={`algorithm-focus ${activeAlgorithm}`}>
          {activeAlgorithm === "direct" && <article className="walkthrough direct-card">
            <div className="walkthrough-head"><div><span>逐位算法 · 当前计算现场</span><h3>{frame.type === "bit" ? `正在送入字节 ${frame.byteIndex + 1} 的 data[${dataBitPosition}]` : "先把一个字节放入数据寄存器"}</h3></div><div className="walk-actions"><b>{refin ? "LSB → MSB" : "MSB → LSB"}</b><button onClick={() => setShowPseudo((value) => !value)}>{showPseudo ? "收起伪代码" : "查看伪代码"}</button></div></div>
            <div className="concept-note blue"><strong>先分清两个寄存器</strong><span>数据字节保存在紫色“数据寄存器”；蓝色才是 CRC 寄存器。逐位法每轮只从数据寄存器取 1 bit，并不会把整个字节写进 CRC。</span></div>
            <RegisterRow label="数据寄存器" note={frame.type === "bit" ? `当前取 data[${dataBitPosition}] = ${frame.dataBit}（第 ${frame.bitIndex + 1}/8 步）` : "等待开始逐位送入"} value={frame.dataByte} width={8} accent="purple" highlightBit={dataBitPosition} />
            <div className="flow-arrow">当前数据位 ↓</div>
            <RegisterRow label="CRC：运算前" note={`取 ${refin ? "最低" : "最高"}位 edge = ${directEdge}`} value={frame.directBefore} width={width} accent="blue" edge={refin ? "right" : "left"} />
            <div className="feedback-equation"><span>反馈位</span><code>edge({directEdge}) ⊕ data[{dataBitPosition ?? "—"}]({frame.type === "bit" ? frame.dataBit : "—"}) = <b>{frame.type === "bit" ? frame.feedback : "—"}</b></code><small>反馈位为 1 才使用 Poly；为 0 就与全 0 异或。</small></div>
            <div className="xor-stack">
              <RegisterRow label="CRC：移位后" note={`${hex(frame.directBefore, width)} ${refin ? ">>" : "<<"} 1`} value={directShifted} width={width} accent="blue" />
              <div className="xor-symbol">⊕</div>
              <RegisterRow label="本轮异或项" note={frame.polyApplied ? `反馈位=1，使用 Poly ${hex(workingPoly, width)}` : "反馈位=0，使用全 0"} value={directPolyOperand} width={width} accent="purple" />
              <div className="xor-rule" />
              <RegisterRow label="CRC：本轮结果" note={`${hex(directShifted, width)} ⊕ ${hex(directPolyOperand, width)} = ${hex(frame.direct, width)}`} value={frame.direct} width={width} accent="blue" />
            </div>
          </article>}

          {activeAlgorithm === "pre" && <article className="walkthrough pre-card">
            <div className="walkthrough-head"><div><span>预异或法 · 两个阶段</span><h3>数据只在阶段 A 整体装入一次</h3></div><div className="walk-actions"><b>先装入 · 后循环</b><button onClick={() => setShowPseudo((value) => !value)}>{showPseudo ? "收起伪代码" : "查看伪代码"}</button></div></div>
            <div className="concept-note amber"><strong>它与逐位法的差别只在运算顺序</strong><span>逐位法每轮计算 edge ⊕ data_bit；预异或法先把 8 个 data bit 全部异或进 CRC，因此后面的 8 轮只看 CRC 边缘位。</span></div>
            <section className="stage-block"><h4><span>A</span>进入当前字节时：只执行一次</h4>
              <RegisterRow label="CRC：字节开始前" note="上一字节留下的余数" value={frame.byteCrcBefore} width={width} accent="blue" />
              <div className="xor-symbol">⊕</div>
              <RegisterRow label="对齐后的数据" note={`${hex(frame.dataByte, 8)} ${refin ? "放在低 8 位" : "放在高 8 位"}`} value={alignedData} width={width} accent="purple" highlightBit={dataBitPosition} />
              <div className="xor-rule" />
              <RegisterRow label="预异或寄存器" note="8 个数据位现在都已经藏进 CRC" value={frame.preloaded} width={width} accent="amber" />
            </section>
            <section className={`stage-block ${frame.type === "bit" ? "" : "muted-stage"}`}><h4><span>B</span>随后循环 8 次：不再读取 data_bit</h4>
              <RegisterRow label="当前寄存器" note={`第 ${Math.max(0, frame.bitIndex) + 1}/8 轮，edge = ${preEdge}`} value={frame.preBefore} width={width} accent="amber" edge={refin ? "right" : "left"} />
              <RegisterRow label="移位结果" note={`${hex(frame.preBefore, width)} ${refin ? ">>" : "<<"} 1`} value={preShifted} width={width} accent="amber" />
              <div className="xor-symbol">⊕</div>
              <RegisterRow label="本轮异或项" note={preEdge ? `edge=1，使用 Poly ${hex(workingPoly, width)}` : "edge=0，使用全 0"} value={prePolyOperand} width={width} accent="purple" />
              <div className="xor-rule" />
              <RegisterRow label="本轮结果" note={`${hex(preShifted, width)} ⊕ ${hex(prePolyOperand, width)}`} value={frame.pre} width={width} accent="amber" />
            </section>
            <div className="relation-note"><b>与逐位法此刻的关系</b><code>预异或寄存器 {hex(frame.pre, width)} = 逐位 CRC {hex(frame.direct, width)} ⊕ 尚未处理的数据 {hex(frame.remainingMask, width)}</code></div>
          </article>}

          {activeAlgorithm === "table" && <article className="walkthrough table-card">
            <div className="walkthrough-head"><div><span>查表法 · 运行时与建表时</span><h3>运行时没有 8 次循环，只有一次索引</h3></div><div className="walk-actions"><b>1 byte / 次</b><button onClick={() => setShowPseudo((value) => !value)}>{showPseudo ? "收起伪代码" : "查看伪代码"}</button></div></div>
            <div className="concept-note green"><strong>这是先后两个阶段，不是同步运行</strong><span>建表阶段先独立生成并保存 256 项；之后处理数据时，程序只计算索引并读取已经存在的表。左右两栏互不驱动。</span></div>
            <div className="table-two-stage">
              <section className="stage-block build-stage"><h4><span>① 程序开始前 / 离线</span>先建立固定速查表</h4>
                <div className="why-256"><b>为什么恰好 256 项？</b><span>以后运行时的查询索引是 8 位数，可能是 0x00～0xFF。现在要提前为每一种索引算好“连续处理 8 bit 后的余数”。</span></div>
                <label className="build-index-control"><span>外层循环：观察 table[index]</span><input aria-label="建表索引" type="range" min={0} max={255} value={buildIndex} onChange={(event) => { setBuildIndex(Number(event.target.value)); setBuildStep(0); }} /><code>index = {hex(buildIndex, 8)}</code></label>
                <div className="build-seed"><span>先把索引装入 CRC 宽度的临时寄存器</span><code>r = {refin ? `index = ${hex(buildIndex, width)}` : `index << (WIDTH - 8) = ${hex(buildIndex << (width - 8), width)}`}</code></div>
                <p>这是内层循环第 {buildStep + 1}/8 次。它只是在生成 <code>table[{hex(buildIndex, 8)}]</code>，与上方运行动画的进度无关。</p>
                <div className="build-step-control" aria-label="建表内层循环步骤">
                  <button onClick={() => setBuildStep((step) => Math.max(0, step - 1))} disabled={buildStep === 0}>上一步</button>
                  {trace.map((_, index) => <button key={index} className={index === buildStep ? "current" : ""} onClick={() => setBuildStep(index)}>{index + 1}</button>)}
                  <button onClick={() => setBuildStep((step) => Math.min(7, step + 1))} disabled={buildStep === 7}>下一步</button>
                </div>
                <RegisterRow label="本轮开始" note={`edge = ${traceStep.edge}`} value={traceStep.before} width={width} accent="green" edge={refin ? "right" : "left"} />
                <RegisterRow label="移位结果" value={traceStep.shifted} width={width} accent="green" />
                <div className="xor-symbol">⊕</div>
                <RegisterRow label="本轮异或项" note={traceStep.edge ? "edge=1，使用 Poly" : "edge=0，使用全 0"} value={tracePolyOperand} width={width} accent="purple" />
                <div className="xor-rule" />
                <RegisterRow label="本轮结果" value={traceStep.after} width={width} accent="green" />
                <div className="bit-compress">{trace.map((step, index) => <span key={index} className={index === buildStep ? "current" : index < buildStep ? "done" : ""}>{index + 1}<small>{hex(step.after, width, false)}</small></span>)}</div>
                <div className="save-entry"><span>8 次全部完成，写入速查表</span><code>table[{hex(buildIndex, 8)}] = <b>{hex(table[buildIndex], width)}</b></code></div>
              </section>
              <section className="stage-block runtime-stage"><h4><span>② 处理数据时</span>当前字节只查一次</h4>
                <div className="runtime-readonly"><b>此时速查表只读</b><span>下面得到哪个 index，就直接读取对应表项；不会再执行左栏的 8 次循环。</span></div>
                <RegisterRow label="CRC 边缘字节" note={`从 ${hex(frame.tableBefore, width)} 取出`} value={tableEdgeByte} width={8} accent="blue" />
                <div className="xor-symbol">⊕</div>
                <RegisterRow label="当前数据字节" note={`第 ${frame.byteIndex + 1} 个字节`} value={frame.dataByte} width={8} accent="purple" />
                <div className="xor-rule" />
                <RegisterRow label="查表索引" note={`${hex(tableEdgeByte, 8)} ⊕ ${hex(frame.dataByte, 8)} = ${hex(frame.tableIndex, 8)}`} value={frame.tableIndex} width={8} accent="green" />
                <div className="lookup-result"><span>读取表项</span><code>table[{hex(frame.tableIndex, 8)}] = <b>{hex(frame.tableValue, width)}</b></code></div>
                <div className="final-equation"><span>合成新 CRC</span><code>{hex(tableCarry, width)} ⊕ {hex(frame.tableValue, width)} = <b>{hex((tableCarry ^ frame.tableValue) & maskFor(width), width)}</b></code></div>
                <button className="copy-runtime-index" onClick={() => { setBuildIndex(runtimeTableIndex); setBuildStep(0); }}>想追溯来源？用 index {hex(runtimeTableIndex, 8)} 去左栏单独演示建表</button>
              </section>
            </div>
          </article>}
          {showPseudo && <aside className="pseudo-popover" role="dialog" aria-label={`${activeAlgorithm === "direct" ? "逐位算法" : activeAlgorithm === "pre" ? "预异或法" : "查表法"}伪代码`}>
            <div><span>{activeAlgorithm === "direct" ? "逐位算法" : activeAlgorithm === "pre" ? "预异或法" : "查表法"} · 伪代码</span><button aria-label="关闭伪代码" onClick={() => setShowPseudo(false)}>关闭</button></div>
            <pre><code>{pseudoCode}</code></pre>
            <small>伪代码已按当前的 {refin ? "反射/右移" : "非反射/左移"} 配置显示。</small>
          </aside>}
        </div>

        <div className={`convergence card ${frame.remainingMask === 0 ? "is-equal" : ""}`}>
          <span className="convergence-label">当前关系</span>
          <div><b>{hex(frame.direct, width)}</b><span>逐位</span></div><i>{frame.remainingMask === 0 ? "=" : "≠"}</i>
          <div><b>{hex(frame.pre, width)}</b><span>预异或</span></div><i>{isByteDone || frame.type === "initial" || frame.type === "final" ? "=" : "↝"}</i>
          <div><b>{hex(frame.table, width)}</b><span>查表</span></div>
          <p>{frame.remainingMask === 0 ? "数据掩码归零：三条路径在字节边界得到相同余数。" : "不要直接比较字节内部的寄存器值；先用“剩余数据掩码”还原它们的关系。"}</p>
        </div>
      </section>

      <section className="table-explorer card" id="table-lab">
        <div className="section-title compact">
          <div><span className="step-badge">03</span><h2>打开这张 256 项速查表</h2></div>
          <p>这是建表阶段最终生成的只读数组。绿色框是左栏正在讲解的建表示例；蓝色框是运行时当前真正读取的表项。</p>
        </div>
        <div className="table-inspector">
          <div className="pinned-value">
            <span>建表示例</span><strong>{hex(buildIndex, 8)}</strong><i>→</i><span>表值</span><strong>{hex(table[buildIndex], width)}</strong>
          </div>
          <code>next_crc = {refin ? "(crc >> 8)" : `((crc << 8) & ${hex(maskFor(width), width)})`} ⊕ table[index]</code>
        </div>
        <div className="crc-table" style={{ gridTemplateColumns: `repeat(16, minmax(${width === 16 ? "4.7" : "3.7"}rem, 1fr))` }}>
          {table.map((value, index) => (
            <button key={index} className={`${index === buildIndex ? "selected" : ""} ${index === runtimeTableIndex ? "runtime-selected" : ""}`} onClick={() => { setBuildIndex(index); setBuildStep(0); }}>
              <small>{index.toString(16).toUpperCase().padStart(2, "0")}</small><b>{hex(value, width, false)}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="mastery card" id="mastery">
        <div className="section-title compact">
          <div><span className="step-badge">04</span><h2>从“看懂”到“真正会写”</h2></div>
          <p>先独立回答，再展开核对。能解释下面四项，才算建立了完整的 CRC 心智模型。</p>
        </div>
        <div className="mastery-grid">
          <details>
            <summary><span>等价关系</span><b>为什么三种算法结果相同？</b></summary>
            <div><code>预异或寄存器 = 逐位 CRC ⊕ 尚未处理的数据</code><p>数据处理完时最后一项归零，因此逐位法与预异或法在每个字节边界汇合；查表法只是把预异或法的 8 次循环提前缓存。</p></div>
          </details>
          <details>
            <summary><span>建表原理</span><b>一张表到底缓存了什么？</b></summary>
            <div><p><code>table[index]</code> 缓存的是：以这个 8 位 index 为种子，在指定 Poly 和移位方向下连续运行 8 次后的余数。</p><p>因此 Poly、宽度或 RefIn 改变时，整张表都必须重新生成。</p></div>
          </details>
          <details>
            <summary><span>常见陷阱</span><b>代码对、结果却不对？</b></summary>
            <div><ul><li><code>0x07</code> 不包含最高项 x⁸。</li><li>反射算法通常使用镜像 Poly，例如 <code>0x8005 ↔ 0xA001</code>。</li><li><code>XorOut</code> 在全部数据完成后才应用。</li><li>比较算法时必须同时核对 Width、Poly、Init、RefIn/RefOut、XorOut。</li></ul></div>
          </details>
          <details>
            <summary><span>3 题自测</span><b>不用运行程序，你能回答吗？</b></summary>
            <div><ol><li>反馈位为 0 时，本轮是否异或 Poly？<em>不异或，等价于异或全 0。</em></li><li>为什么预异或法的字节中间值可能不同？<em>寄存器里还混有尚未处理的数据。</em></li><li>为什么查表法一次能前进 8 bit？<em>表项已经缓存了这 8 次线性变换。</em></li></ol></div>
          </details>
        </div>
      </section>

      <footer>
        <p><strong>核心结论</strong>：逐位法和预异或法利用异或的线性特性重新安排运算顺序；查表法再把连续 8 次同样的线性变换预计算。</p>
        <span>CRC LAB · 为理解而展开，为效率而折叠</span>
      </footer>
    </main>
  );
}
