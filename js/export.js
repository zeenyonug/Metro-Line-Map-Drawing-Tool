// 导出功能
const Export = (() => {
  let modal;
  let previewArea;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function init() {
    modal = document.getElementById('exportModal');
    previewArea = document.getElementById('previewArea');

    document.getElementById('exportBtn').addEventListener('click', showExport);
    document.getElementById('closeExportBtn').addEventListener('click', hideExport);

    // 图片下载面板展开/折叠
    const toggleImg = document.getElementById('toggleImageDownload');
    const imgPanel = document.getElementById('imageDownloadPanel');
    toggleImg.addEventListener('change', () => {
      imgPanel.classList.toggle('show', toggleImg.checked);
      updateStartBtn();
    });

    // 格式切换时显示/隐藏分辨率选项
    document.querySelectorAll('input[name="imgFormat"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const isPng = document.querySelector('input[name="imgFormat"]:checked').value === 'png';
        document.getElementById('resolutionGroup').style.display = isPng ? 'block' : 'none';
      });
    });

    // 音频下载面板展开/折叠
    const toggleAudio = document.getElementById('toggleAudioDownload');
    const audioPanel = document.getElementById('audioDownloadPanel');
    toggleAudio.addEventListener('change', () => {
      audioPanel.classList.toggle('show', toggleAudio.checked);
      updateStartBtn();
    });

    // MLMDT导出面板展开/折叠
    const toggleMlmdt = document.getElementById('toggleMlmdtExport');
    const mlmdtPanel = document.getElementById('mlmdtExportPanel');
    if (toggleMlmdt) {
      toggleMlmdt.addEventListener('change', () => {
        mlmdtPanel.classList.toggle('show', toggleMlmdt.checked);
        updateStartBtn();
      });
    }

    // 图例位置变更 → 刷新预览
    const legendCorner = document.getElementById('legendCorner');
    if (legendCorner) {
      legendCorner.addEventListener('change', generatePreview);
    }

    const legendLangCn = document.getElementById('legendLangCn');
    const legendLangEn = document.getElementById('legendLangEn');
    if (legendLangCn) legendLangCn.addEventListener('change', generatePreview);
    if (legendLangEn) legendLangEn.addEventListener('change', generatePreview);

    // 统一"开始下载"按钮
    document.getElementById('startDownloadBtn').addEventListener('click', startDownload);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) hideExport();
    });
  }

  function updateStartBtn() {
    const imgChecked = document.getElementById('toggleImageDownload').checked;
    const audioChecked = document.getElementById('toggleAudioDownload').checked;
    const mlmdtChecked = document.getElementById('toggleMlmdtExport') && document.getElementById('toggleMlmdtExport').checked;
    const btn = document.getElementById('startDownloadBtn');
    if (!imgChecked && !audioChecked && !mlmdtChecked) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  }

  async function startDownload() {
    const imgChecked = document.getElementById('toggleImageDownload').checked;
    const audioChecked = document.getElementById('toggleAudioDownload').checked;
    const mlmdtChecked = document.getElementById('toggleMlmdtExport') && document.getElementById('toggleMlmdtExport').checked;

    if (!imgChecked && !audioChecked && !mlmdtChecked) {
      showToast('请至少选择一项下载内容', 'error');
      return;
    }

    // 图片和音频同时开始
    const tasks = [];
    if (imgChecked) {
      const format = document.querySelector('input[name="imgFormat"]:checked').value;
      if (format === 'svg') downloadSvg();
      else downloadPng();
    }
    if (audioChecked) {
      tasks.push(downloadAudioZip());
    }
    if (mlmdtChecked) {
      Home.exportMLMDT();
    }
    await Promise.all(tasks);
  }

  function showExport() {
    modal.classList.add('show');
    updateStartBtn();
    generatePreview();
  }

  function hideExport() {
    modal.classList.remove('show');
  }

  function generatePreview() {
    const state = State.getState();

    // 创建离屏SVG用于导出
    const exportSvg = createExportSvg(state);

    // 显示预览
    previewArea.innerHTML = '';
    previewArea.appendChild(exportSvg);
  }

  function getLegendCorner() {
    const sel = document.getElementById('legendCorner');
    return sel ? sel.value : 'top-right';
  }

  function getLegendLangs() {
    const cn = document.getElementById('legendLangCn');
    const en = document.getElementById('legendLangEn');
    return {
      cn: cn ? cn.checked : true,
      en: en ? en.checked : true
    };
  }

  function createExportSvg(state) {
    // 计算边界
    const bounds = calculateBounds(state);

    const padding = 60;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    // 白色背景
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', width);
    bg.setAttribute('height', height);
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);

    const offsetX = padding - bounds.minX;
    const offsetY = padding - bounds.minY;

    // 渲染线路（不再渲染中点线路名标签）
    state.lines.forEach(line => {
      const stations = line.stationIds.map(id => state.stations.find(s => s.id === id)).filter(Boolean);
      if (stations.length < 2) return;

      // 环线：首尾相连
      const pathStations = line.isLoop ? [...stations, stations[0]] : stations;
      const points = Geometry.generateMultiStationPath(pathStations);
      const pathData = Geometry.pointsToPathData(
        points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
      );

      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', line.color);
      path.setAttribute('stroke-width', 4);
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
    });

    // 渲染站点（含双语标签）
    state.stations.forEach(station => {
      const linesReferencing = state.lines.filter(l => l.stationIds.includes(station.id));
      const isTransfer = linesReferencing.length > 1;
      const x = station.x + offsetX;
      const y = station.y + offsetY;

      // 站点圆形
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', isTransfer ? 10 : 7);

      if (isTransfer) {
        circle.setAttribute('fill', '#ffffff');
        circle.setAttribute('stroke', '#0f172a');
        circle.setAttribute('stroke-width', '3');

        const innerCircle = document.createElementNS(SVG_NS, 'circle');
        innerCircle.setAttribute('cx', x);
        innerCircle.setAttribute('cy', y);
        innerCircle.setAttribute('r', 4);
        innerCircle.setAttribute('fill', '#0f172a');
        svg.appendChild(innerCircle);
      } else {
        circle.setAttribute('fill', '#0f172a');
        circle.setAttribute('stroke', '#ffffff');
        circle.setAttribute('stroke-width', '2');
      }
      svg.appendChild(circle);

      // 中文标签
      if (station.name) {
        const labelPos = station.labelPosition === 'auto'
          ? Geometry.computeAutoLabelPosition(station, state.lines, state.stations)
          : (station.labelPosition || 'right');
        const offset = Geometry.getLabelOffset(labelPos);
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', x + offset.x);
        label.setAttribute('y', y + offset.y);
        label.setAttribute('text-anchor', offset.anchor);
        label.setAttribute('font-size', '13');
        label.setAttribute('font-weight', '500');
        label.setAttribute('font-family', 'Microsoft YaHei, sans-serif');
        label.setAttribute('fill', '#0f172a');
        label.textContent = station.name;
        svg.appendChild(label);

        // 英文标签（中文下方 y+14，字号 10，灰色）
        if (station.nameEn) {
          const labelEn = document.createElementNS(SVG_NS, 'text');
          labelEn.setAttribute('x', x + offset.x);
          labelEn.setAttribute('y', y + offset.y + 14);
          labelEn.setAttribute('text-anchor', offset.anchor);
          labelEn.setAttribute('font-size', '10');
          labelEn.setAttribute('font-family', 'Microsoft YaHei, sans-serif');
          labelEn.setAttribute('fill', '#64748b');
          labelEn.textContent = station.nameEn;
          svg.appendChild(labelEn);
        }
      }
    });

    // 渲染文本块
    state.textBlocks.forEach(tb => {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', tb.x + offsetX);
      text.setAttribute('y', tb.y + offsetY);
      text.setAttribute('font-family', tb.fontFamily);
      text.setAttribute('font-size', tb.fontSize);
      text.setAttribute('fill', tb.color);
      text.textContent = tb.content;
      svg.appendChild(text);
    });

    // 渲染角落图例
    appendCornerLegend(svg, state, width, height);

    return svg;
  }

  // 在指定角落添加图例（每条线路一条色条 + 中英文名，每竖列最多8条，超出换下一列）
  function appendCornerLegend(svg, state, width, height) {
    if (!state.lines || state.lines.length === 0) return;

    const lines = state.lines;
    const langs = getLegendLangs();
    const showCn = langs.cn;
    const showEn = langs.en;
    const isSingleLang = (showCn !== showEn);

    // ===== 布局参数 =====
    const cnFontSize = isSingleLang ? 14 : 10;
    const enFontSize = isSingleLang ? 11 : 8;
    const cnAscent = cnFontSize * 0.86;   // 中文字形上升（baseline到顶）
    const cnDescent = cnFontSize * 0.2;   // 中文字形下降（baseline到底）
    const enAscent = enFontSize * 0.8;
    const enDescent = enFontSize * 0.22;
    const cnEnGap = 2;                    // 中文底线到英文顶线间距
    const barWidth = 9;
    const barHeight = cnFontSize * 0.75;  // 色条高度 ≈ 中文 3/4
    const textGap = 6;                    // 色条右沿到文字左沿
    const padH = 10;                      // 外框水平内边距
    const padV = 10;                      // 外框垂直内边距
    const entryGap = 8;                   // 条目之间行间距
    const colGap = 12;
    const maxRows = 8;

    // ===== 先算出单条条目内，各元素相对"条目原点 (0,0)"的坐标 =====
    //  中文 baseline 放在 cnAscent（这样中文顶部刚好在 y≈0）
    const cnBaseline = cnAscent;
    const cnTop = 0;
    const cnBottom = cnBaseline + cnDescent;
    //  英文
    const enTop = showCn ? (cnBottom + cnEnGap) : 0;
    const enBaseline = enTop + enAscent;
    const enBottom = enBaseline + enDescent;
    //  色条中心对齐中文中心
    const cnCenter = cnBaseline - cnFontSize * 0.4;
    const barTop = cnCenter - barHeight / 2;
    const barBottom = barTop + barHeight;
    //  单条条目内容实际占用的垂直范围（留一点上下呼吸空间）
    const contentTop = Math.min(cnTop, enTop, barTop);
    const contentBottom = Math.max(cnBottom, enBottom, barBottom);
    const entryHeight = (contentBottom - contentTop) + 4;

    // 因为我们要把内容整体放在"条目"顶部下方 contentTop 偏移处
    const shiftY = -contentTop + 2;

    // ===== 文字宽度估算 =====
    function estimateTextWidth(line) {
      let cnW = 0, enW = 0;
      if (showCn) {
        for (const ch of (line.name || '')) {
          const isCJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/.test(ch);
          cnW += isCJK ? cnFontSize : cnFontSize * 0.58;
        }
      }
      if (showEn) {
        for (const ch of (line.nameEn || '')) {
          const isCJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/.test(ch);
          enW += isCJK ? enFontSize : enFontSize * 0.58;
        }
      }
      return Math.max(cnW, enW, 24);
    }

    const maxTextWidth = Math.max(...lines.map(estimateTextWidth));
    const entryWidth = barWidth + textGap + maxTextWidth + 6;
    const totalLines = lines.length;
    const colCount = Math.ceil(totalLines / maxRows);
    const rowCount = Math.min(totalLines, maxRows);

    const legendWidth = colCount * entryWidth + (colCount - 1) * colGap + padH * 2;
    const legendHeight = rowCount * entryHeight + (rowCount - 1) * entryGap + padV * 2;

    // ===== 定位图例框 =====
    const corner = getLegendCorner();
    const margin = 20;
    let legendX, legendY;
    if (corner === 'top-left') {
      legendX = margin;
      legendY = margin;
    } else if (corner === 'top-right') {
      legendX = width - margin - legendWidth;
      legendY = margin;
    } else if (corner === 'bottom-left') {
      legendX = margin;
      legendY = height - margin - legendHeight;
    } else {
      legendX = width - margin - legendWidth;
      legendY = height - margin - legendHeight;
    }

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'legend');

    const bgRect = document.createElementNS(SVG_NS, 'rect');
    bgRect.setAttribute('x', legendX);
    bgRect.setAttribute('y', legendY);
    bgRect.setAttribute('width', legendWidth);
    bgRect.setAttribute('height', legendHeight);
    bgRect.setAttribute('fill', '#ffffff');
    bgRect.setAttribute('fill-opacity', '0.9');
    bgRect.setAttribute('stroke', '#cbd5e1');
    bgRect.setAttribute('stroke-width', '1');
    bgRect.setAttribute('rx', '4');
    group.appendChild(bgRect);

    // ===== 画每个条目 =====
    lines.forEach((line, i) => {
      const col = Math.floor(i / maxRows);
      const row = i % maxRows;
      const entryX = legendX + padH + col * (entryWidth + colGap);
      const entryY = legendY + padV + row * (entryHeight + entryGap);
      const lineType = line.type || 'normal';

      const bX = entryX;
      const bY = entryY + shiftY + barTop;   // 色条实际y
      const tX = entryX + barWidth + textGap; // 文字x
      const cnY = entryY + shiftY + cnBaseline;
      const enY = entryY + shiftY + enBaseline;

      function drawLineSample(drawAtX, drawAtY, drawW, drawH) {
        const midY = drawAtY + drawH / 2;
        if (lineType === 'highspeed') {
          const top = document.createElementNS(SVG_NS, 'line');
          top.setAttribute('x1', drawAtX); top.setAttribute('y1', midY - drawH * 0.35);
          top.setAttribute('x2', drawAtX + drawW); top.setAttribute('y2', midY - drawH * 0.35);
          top.setAttribute('stroke', line.color || '#999'); top.setAttribute('stroke-width', '1.5');
          group.appendChild(top);
          const bot = document.createElementNS(SVG_NS, 'line');
          bot.setAttribute('x1', drawAtX); bot.setAttribute('y1', midY + drawH * 0.35);
          bot.setAttribute('x2', drawAtX + drawW); bot.setAttribute('y2', midY + drawH * 0.35);
          bot.setAttribute('stroke', line.color || '#999'); bot.setAttribute('stroke-width', '1.5');
          group.appendChild(bot);
          const mid = document.createElementNS(SVG_NS, 'line');
          mid.setAttribute('x1', drawAtX); mid.setAttribute('y1', midY);
          mid.setAttribute('x2', drawAtX + drawW); mid.setAttribute('y2', midY);
          mid.setAttribute('stroke', line.color || '#999'); mid.setAttribute('stroke-width', '2');
          mid.setAttribute('stroke-dasharray', `${Math.max(3, drawH * 0.6)} ${Math.max(2, drawH * 0.4)}`);
          group.appendChild(mid);
        } else if (lineType === 'hollow') {
          const outer = document.createElementNS(SVG_NS, 'rect');
          outer.setAttribute('x', drawAtX); outer.setAttribute('y', drawAtY);
          outer.setAttribute('width', drawW); outer.setAttribute('height', drawH);
          outer.setAttribute('fill', line.color || '#999'); outer.setAttribute('rx', '1');
          group.appendChild(outer);
          const inset = Math.max(0.6, drawW * 0.28);
          const inner = document.createElementNS(SVG_NS, 'rect');
          inner.setAttribute('x', drawAtX + inset); inner.setAttribute('y', drawAtY + inset);
          inner.setAttribute('width', Math.max(0.6, drawW - inset * 2));
          inner.setAttribute('height', Math.max(0.6, drawH - inset * 2));
          inner.setAttribute('fill', '#ffffff'); inner.setAttribute('rx', '0.5');
          group.appendChild(inner);
        } else if (lineType === 'dashed') {
          const l = document.createElementNS(SVG_NS, 'line');
          l.setAttribute('x1', drawAtX); l.setAttribute('y1', drawAtY + drawH / 2);
          l.setAttribute('x2', drawAtX + drawW); l.setAttribute('y2', drawAtY + drawH / 2);
          l.setAttribute('stroke', line.color || '#999'); l.setAttribute('stroke-width', drawH);
          l.setAttribute('stroke-dasharray', `${Math.max(3, drawH * 0.8)} ${Math.max(2, drawH * 0.5)}`);
          l.setAttribute('stroke-linecap', 'butt');
          group.appendChild(l);
        } else {
          const bar = document.createElementNS(SVG_NS, 'rect');
          bar.setAttribute('x', drawAtX); bar.setAttribute('y', drawAtY);
          bar.setAttribute('width', drawW); bar.setAttribute('height', drawH);
          bar.setAttribute('fill', line.color || '#999'); bar.setAttribute('rx', '2');
          group.appendChild(bar);
        }
      }
      drawLineSample(bX, bY, barWidth, barHeight);

      if (showCn) {
        const nameCn = document.createElementNS(SVG_NS, 'text');
        nameCn.setAttribute('x', tX);
        nameCn.setAttribute('y', cnY);
        nameCn.setAttribute('font-size', String(cnFontSize));
        nameCn.setAttribute('font-weight', 'bold');
        nameCn.setAttribute('font-family', 'Microsoft YaHei, sans-serif');
        nameCn.setAttribute('fill', '#0f172a');
        nameCn.textContent = line.name || '未命名线路';
        group.appendChild(nameCn);
      }

      if (showEn) {
        const nameEn = document.createElementNS(SVG_NS, 'text');
        nameEn.setAttribute('x', tX);
        nameEn.setAttribute('y', enY);
        nameEn.setAttribute('font-size', String(enFontSize));
        nameEn.setAttribute('font-family', 'Microsoft YaHei, sans-serif');
        nameEn.setAttribute('fill', '#64748b');
        nameEn.textContent = line.nameEn || '';
        group.appendChild(nameEn);
      }
    });

    svg.appendChild(group);
  }

  function calculateBounds(state) {
    const elements = [
      ...state.stations.map(s => ({ x: s.x, y: s.y })),
      ...state.textBlocks.map(t => ({ x: t.x, y: t.y }))
    ];

    if (elements.length === 0) {
      return { minX: -100, minY: -100, width: 200, height: 200 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    elements.forEach(e => {
      minX = Math.min(minX, e.x);
      minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x);
      maxY = Math.max(maxY, e.y);
    });

    return {
      minX,
      minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  function downloadSvg() {
    const state = State.getState();
    const svg = createExportSvg(state);
    const svgData = new XMLSerializer().serializeToString(svg);

    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `metro-map-${Date.now()}.svg`;
    a.click();

    URL.revokeObjectURL(url);
  }

  function downloadPng() {
    const state = State.getState();
    const svg = createExportSvg(state);
    const svgData = new XMLSerializer().serializeToString(svg);

    const scaleSelect = document.getElementById('pngScale');
    const scale = scaleSelect ? parseInt(scaleSelect.value) : 2;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = svg.viewBox.baseVal.width * scale;
      canvas.height = svg.viewBox.baseVal.height * scale;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);

      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = pngUrl;
        a.download = `metro-map-${scale}x-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(pngUrl);
      }, 'image/png');
    };

    img.src = url;
  }

  // ============ 音频 ZIP 导出 ============

  // 检测换乘：两条线路若共享至少一个 stationId 则视为可换乘
  function getTransfersForLine(line, allLines) {
    const set = new Set(line.stationIds);
    return allLines.filter(other => other.id !== line.id && other.stationIds.some(id => set.has(id)));
  }

  // 文件名/路径安全化（移除 Windows/Linux 非法字符）
  function sanitizeFileName(name) {
    return String(name).replace(/[\/\\:*?"<>|]/g, '_').trim() || 'unnamed';
  }

  // 构建所有待写入 ZIP 的文本文件
  function buildAudioFilesData(state) {
    const cnFixed = [
      { name: '下一站.txt', content: '下一站' },
      { name: '可换乘.txt', content: '可换乘' },
      { name: '是本次列车的终点站.txt', content: '是本次列车的终点站' },
      { name: '车厢内严禁饮食.txt', content: '车厢内严禁饮食' },
      { name: '请上车的乘客往车厢中部走.txt', content: '请上车的乘客往车厢中部走' },
      { name: '本次列车开往.txt', content: '本次列车开往' },
      { name: '请勿在车厢地板上蹲、坐、躺、卧.txt', content: '请勿在车厢地板上蹲、坐、躺、卧' }
    ];
    const enFixed = [
      { name: 'Next station.txt', content: 'Next station' },
      { name: 'Interchange available.txt', content: 'Interchange available' },
      { name: 'This is the terminal station.txt', content: 'This is the terminal station' },
      { name: 'No eating or drinking in the carriage.txt', content: 'No eating or drinking in the carriage' },
      { name: 'Please move to the center of the carriage.txt', content: 'Please move to the center of the carriage' },
      { name: 'This train is bound for.txt', content: 'This train is bound for' },
      { name: 'Please do not squat, sit, lie down on the floor.txt', content: 'Please do not squat, sit, lie down on the floor' }
    ];

    const files = []; // { path, content }

    cnFixed.forEach(f => files.push({ path: `中文/固定音频/${f.name}`, content: f.content }));
    enFixed.forEach(f => files.push({ path: `英语/固定音频/${f.name}`, content: f.content }));

    state.lines.forEach(line => {
      const lineNameCn = (line.name || '未命名线路').trim() || '未命名线路';
      const lineNameEn = (line.nameEn || line.name || 'Unnamed Line').trim() || 'Unnamed Line';
      const safeLineCn = sanitizeFileName(lineNameCn);
      const safeLineEn = sanitizeFileName(lineNameEn);

      // 站点音频
      line.stationIds.forEach(sid => {
        const st = state.stations.find(s => s.id === sid);
        if (!st) return;
        const stNameCn = (st.name || '未命名站点').trim() || '未命名站点';
        const stNameEn = (st.nameEn || st.name || 'Unnamed Station').trim() || 'Unnamed Station';
        files.push({
          path: `中文/${safeLineCn}/${sanitizeFileName(stNameCn)}.txt`,
          content: stNameCn
        });
        files.push({
          path: `英语/${safeLineEn}/${sanitizeFileName(stNameEn)}.txt`,
          content: stNameEn
        });
      });

      // 换乘音频
      const transfers = getTransfersForLine(line, state.lines);
      transfers.forEach(other => {
        const otherNameCn = (other.name || '未命名线路').trim() || '未命名线路';
        const otherNameEn = (other.nameEn || other.name || 'Unnamed Line').trim() || 'Unnamed Line';
        files.push({
          path: `中文/${safeLineCn}/可换乘_${sanitizeFileName(otherNameCn)}.txt`,
          content: `可换乘${otherNameCn}`
        });
        files.push({
          path: `英语/${safeLineEn}/Interchange_${sanitizeFileName(otherNameEn)}.txt`,
          content: `Interchange ${otherNameEn}`
        });
      });
    });

    return files;
  }

  // 生成 gTTS 转换脚本（Python），用于将 ZIP 内文本文件批量转换为同名 MP3
  function buildGenerateAudioScript() {
    return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
报站音频生成脚本

读取 ZIP 解压后所有 .txt 文本文件，使用 gTTS 生成对应的同名 .mp3 文件。
- 中文/ 目录下使用 lang='zh-CN'
- 英语/ 目录下使用 lang='en'
- 生成的 .mp3 与 .txt 文件位于同一目录

依赖：pip install gTTS
"""
import os
import sys

try:
    from gtts import gTTS
except ImportError:
    print('未安装 gTTS，请运行: pip install gTTS')
    sys.exit(1)


def read_text(txt_path):
    with open(txt_path, 'r', encoding='utf-8') as f:
        return f.read().strip()


def detect_lang(txt_path, root):
    rel = os.path.relpath(txt_path, root).replace('\\\\', '/')
    if rel.startswith('中文'):
        return 'zh-CN'
    if rel.startswith('英语'):
        return 'en'
    return 'en'


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    generated = 0
    skipped = 0
    failed = 0

    for dirpath, dirnames, filenames in os.walk(root):
        for fn in filenames:
            if not fn.lower().endswith('.txt'):
                continue
            txt_path = os.path.join(dirpath, fn)
            mp3_path = os.path.splitext(txt_path)[0] + '.mp3'
            if os.path.exists(mp3_path):
                skipped += 1
                continue
            try:
                text = read_text(txt_path)
                if not text:
                    continue
                lang = detect_lang(txt_path, root)
                tts = gTTS(text=text, lang=lang)
                tts.save(mp3_path)
                generated += 1
                print(f'生成: {os.path.relpath(mp3_path, root)}')
            except Exception as e:
                failed += 1
                print(f'失败: {os.path.relpath(txt_path, root)} -> {e}')

    print(f'完成。生成 {generated} 个，跳过 {skipped} 个已存在，失败 {failed} 个。')


if __name__ == '__main__':
    main()
`;
  }

  // ============ meSpeak.js 离线 TTS 合成 ============

  let mespeakReady = false;
  let mespeakInitPromise = null;

  // 初始化 meSpeak：加载中英文语音模块（仅需一次）
  function initMeSpeak() {
    if (mespeakReady) return Promise.resolve(true);
    if (mespeakInitPromise) return mespeakInitPromise;
    mespeakInitPromise = new Promise((resolve, reject) => {
      if (typeof meSpeak === 'undefined') {
        reject(new Error('meSpeak 未加载'));
        return;
      }
      // 用计数器等待两个语音都回调完毕再判定，避免并行竞态导致先到者误判失败
      let zhOk = false, enOk = false, settled = false;
      let pending = 2;
      function checkDone() {
        if (settled) return;
        if (pending > 0) return; // 还有语音未回调
        settled = true;
        if (zhOk && enOk) {
          mespeakReady = true;
          resolve(true);
        } else {
          reject(new Error('语音模块加载失败 zh=' + zhOk + ' en=' + enOk));
        }
      }
      // 加载中文语音 (voices/zh.json) 与英文语音 (voices/en/en-us.json)
      meSpeak.loadVoice('zh', (success) => { zhOk = !!success; pending--; checkDone(); });
      meSpeak.loadVoice('en/en-us', (success) => { enOk = !!success; pending--; checkDone(); });
      // 超时保护（8 秒）
      setTimeout(() => { if (!settled) { settled = true; reject(new Error('语音模块加载超时')); } }, 8000);
    });
    return mespeakInitPromise;
  }

  // 用 meSpeak 合成单条文本为 WAV Blob（rawdata 模式直接返回 ArrayBuffer，不播放）
  function synthWithMeSpeak(text, voice) {
    return new Promise((resolve) => {
      let settled = false;
      // 超时保护：meSpeak 在 defaultVoice 未就绪等极端情况下可能永不回调
      const timer = setTimeout(() => {
        if (!settled) { settled = true; resolve(null); }
      }, 30000);
      try {
        meSpeak.speak(text, {
          rawdata: true,
          voice: voice,
          amplitude: 100,
          pitch: 50,
          speed: 175,
          wordgap: 0
        }, (success, id, audiodata) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (success && audiodata) {
            // audiodata 可能是 ArrayBuffer 或 Array，统一转为 Uint8Array 以确保 Blob 正确生成
            let binaryData;
            if (audiodata instanceof ArrayBuffer) {
              binaryData = audiodata;
            } else if (Array.isArray(audiodata)) {
              binaryData = new Uint8Array(audiodata);
            } else if (audiodata.buffer) {
              binaryData = audiodata.buffer;
            } else {
              binaryData = new Uint8Array(audiodata);
            }
            resolve(new Blob([binaryData], { type: 'audio/wav' }));
          } else {
            resolve(null);
          }
        });
      } catch (e) {
        if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
      }
    });
  }

  // 显示进度浮层
  function showProgress(total) {
    const div = document.createElement('div');
    div.id = 'audioProgress';
    div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e293b;color:#f1f5f9;padding:24px 32px;border-radius:12px;z-index:99999;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);text-align:center;min-width:300px;';
    div.innerHTML = `
      <div style="margin-bottom:12px;font-weight:600;">正在生成报站音频...</div>
      <div style="background:#334155;border-radius:6px;height:8px;overflow:hidden;">
        <div id="audioProgressBar" style="background:#22c55e;height:100%;width:0%;transition:width 0.3s;"></div>
      </div>
      <div id="audioProgressText" style="margin-top:8px;font-size:12px;color:#94a3b8;">0 / ${total}</div>
    `;
    document.body.appendChild(div);
  }
  function updateProgress(done, total, label) {
    const bar = document.getElementById('audioProgressBar');
    const text = document.getElementById('audioProgressText');
    if (bar) bar.style.width = (done / total * 100) + '%';
    if (text) text.textContent = `${done} / ${total}` + (label ? ` — ${label}` : '');
  }
  function hideProgress() {
    const el = document.getElementById('audioProgress');
    if (el) el.remove();
  }

  async function downloadAudioZip() {
    if (typeof JSZip === 'undefined') { showToast('JSZip 未加载，无法生成 ZIP', 'error'); return; }

    const state = State.getState();
    const files = buildAudioFilesData(state);
    if (files.length === 0) { showToast('没有可导出的线路数据', 'error'); return; }

    // 初始化 meSpeak 语音引擎（首次加载中英文语音模块）
    let meSpeakAvailable = false;
    if (typeof meSpeak !== 'undefined') {
      try {
        await initMeSpeak();
        meSpeakAvailable = true;
      } catch (e) {
        meSpeakAvailable = false;
        console.warn('meSpeak 初始化失败:', e.message);
      }
    }

    if (!meSpeakAvailable) {
      showToast('语音引擎加载失败，将导出文本文件 + Python 脚本', 'error');
      return downloadTextOnlyZip();
    }

    showProgress(files.length);
    const zip = new JSZip();
    let done = 0;
    let successCount = 0;
    let failCount = 0;

    for (const f of files) {
      const voice = f.path.startsWith('中文') ? 'zh' : 'en/en-us';
      const label = f.path.split('/').pop().replace('.txt', '');
      updateProgress(done, files.length, label);

      try {
        const wavBlob = await synthWithMeSpeak(f.content, voice);
        if (wavBlob) {
          const wavPath = f.path.replace('.txt', '.wav');
          zip.file(wavPath, wavBlob);
          successCount++;
        } else {
          zip.file(f.path, f.content); // 合成失败，回退文本
          failCount++;
        }
      } catch (e) {
        zip.file(f.path, f.content); // 异常，回退文本
        failCount++;
      }
      done++;
      updateProgress(done, files.length, label);
      // 让 worker 有时间清理，避免连续合成卡顿
      await new Promise(r => setTimeout(r, 50));
    }

    hideProgress();

    // 全部失败则回退纯文本方案
    if (successCount === 0) {
      showToast('语音合成全部失败，将导出文本文件 + Python 脚本', 'error');
      return downloadTextOnlyZip();
    }

    // 部分失败时给出提示
    if (failCount > 0) {
      console.warn(`音频合成：成功 ${successCount} 个，失败 ${failCount} 个（失败项已回退为文本）。`);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metro-audio-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 纯文本回退方案
  async function downloadTextOnlyZip() {
    const state = State.getState();
    const files = buildAudioFilesData(state);
    const zip = new JSZip();
    files.forEach(f => zip.file(f.path, f.content));
    zip.file('generate_audio.py', buildGenerateAudioScript());
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metro-audio-text-${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { init };
})();
