// 几何计算工具 - 0°/45°/90° 角度约束路由
const Geometry = (() => {

  /**
   * 生成仅使用 0°/45°/90° 角度的折线路径
   * 真实地铁线路风格：先走45°斜线，再走直线（水平或垂直）
   * @param {number} x1 起点 X
   * @param {number} y1 起点 Y
   * @param {number} x2 终点 X
   * @param {number} y2 终点 Y
   * @returns {{x: number, y: number}[]} 路径点数组
   */
  function generatePath(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // 同一点
    if (absDx < 1 && absDy < 1) {
      return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    }

    // 纯水平或垂直
    if (absDy < 1) {
      return [{ x: x1, y: y1 }, { x: x2, y: y1 }];
    }
    if (absDx < 1) {
      return [{ x: x1, y: y1 }, { x: x1, y: y2 }];
    }

    const signX = dx > 0 ? 1 : -1;
    const signY = dy > 0 ? 1 : -1;

    let points;

    // 真实地铁线路风格：先走45°斜线，再走直线
    // 斜线段长度 = min(absDx, absDy)，剩余部分为直线
    const diagonalLen = Math.min(absDx, absDy);
    
    // 斜线终点：从起点走 diagonalLen 的45°斜线
    const midX = x1 + signX * diagonalLen;
    const midY = y1 + signY * diagonalLen;

    if (absDx >= absDy) {
      // 水平方向更长：斜线后走水平直线
      points = [
        { x: x1, y: y1 },
        { x: midX, y: midY },
        { x: x2, y: midY }
      ];
    } else {
      // 垂直方向更长：斜线后走垂直直线
      points = [
        { x: x1, y: y1 },
        { x: midX, y: midY },
        { x: midX, y: y2 }
      ];
    }

    // 简化路径（移除太近的点）
    return simplifyPath(points);
  }

  /**
   * 简化路径，移除距离太近的连续点
   */
  function simplifyPath(points, minDist = 2) {
    if (points.length <= 2) return points;

    const result = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const last = result[result.length - 1];
      const curr = points[i];
      const dist = Math.hypot(curr.x - last.x, curr.y - last.y);
      if (dist >= minDist || i === points.length - 1) {
        result.push(curr);
      }
    }
    return result;
  }

  /**
   * 将路径点转换为 SVG path 数据（带圆角）
   */
  function pointsToPathData(points) {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    
    let d = `M ${points[0].x} ${points[0].y}`;
    
    if (points.length === 2) {
      d += ` L ${points[1].x} ${points[1].y}`;
      return d;
    }

    const cornerRadius = 3;
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // 计算到当前角点的距离
      const distPrev = distance(prev.x, prev.y, curr.x, curr.y);
      const distNext = distance(curr.x, curr.y, next.x, next.y);
      const r = Math.min(cornerRadius, distPrev / 2, distNext / 2);
      
      // 沿 prev->curr 方向回退 r
      const tPrev = r / distPrev;
      const p1x = curr.x + (prev.x - curr.x) * tPrev;
      const p1y = curr.y + (prev.y - curr.y) * tPrev;
      
      // 沿 curr->next 方向前进 r
      const tNext = r / distNext;
      const p2x = curr.x + (next.x - curr.x) * tNext;
      const p2y = curr.y + (next.y - curr.y) * tNext;
      
      // 画到 p1，然后用二次贝塞尔曲线到 p2（控制点为角点）
      d += ` L ${p1x} ${p1y} Q ${curr.x} ${curr.y} ${p2x} ${p2y}`;
    }
    
    // 最后一段直线
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;
    
    return d;
  }

  /**
   * 沿路径点集偏移（平移），生成偏移后的路径点
   * offset > 0 表示向左法向偏移，offset < 0 向右法向偏移
   */
  function offsetPath(points, offset) {
    if (points.length < 2) return points.map(p => ({ x: p.x + offset, y: p.y }));
    const result = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[i - 1] || points[i];
      const next = points[i + 1] || points[i];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      // 垂直方向（左法向）
      const nx = -dy / len;
      const ny = dx / len;
      result.push({
        x: points[i].x + nx * offset,
        y: points[i].y + ny * offset
      });
    }
    return result;
  }

  /**
   * 计算路径的总长度
   */
  function pathLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y
      );
    }
    return length;
  }

  /**
   * 计算路径中点（用于放置标签）
   */
  function pathMidpoint(points) {
    const totalLen = pathLength(points);
    const targetLen = totalLen / 2;
    let traversed = 0;

    for (let i = 1; i < points.length; i++) {
      const segLen = Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y
      );
      if (traversed + segLen >= targetLen) {
        const t = (targetLen - traversed) / segLen;
        return {
          x: points[i - 1].x + t * (points[i].x - points[i - 1].x),
          y: points[i - 1].y + t * (points[i].y - points[i - 1].y)
        };
      }
      traversed += segLen;
    }

    return points[points.length - 1];
  }

  /**
   * 估算文本像素宽度
   * 中日韩字符宽度 ≈ 字号，其他字符 ≈ 字号 * 0.55
   */
  function estimateTextWidth(text, fontSize) {
    if (!text) return 0;
    let width = 0;
    for (const ch of text) {
      const isCJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/.test(ch);
      width += isCJK ? fontSize : fontSize * 0.55;
    }
    return width;
  }

  /**
   * 线段与轴对齐矩形相交检测（Liang-Barsky 算法）
   */
  function segmentIntersectsBox(x1, y1, x2, y2, bx1, by1, bx2, by2) {
    if (x1 >= bx1 && x1 <= bx2 && y1 >= by1 && y1 <= by2) return true;
    if (x2 >= bx1 && x2 <= bx2 && y2 >= by1 && y2 <= by2) return true;

    let t0 = 0, t1 = 1;
    const dx = x2 - x1, dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - bx1, bx2 - x1, y1 - by1, by2 - y1];

    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return false;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return false;
          if (t < t1) t1 = t;
        }
      }
    }
    return t0 <= t1;
  }

  /**
   * 计算标签边界框（相对站点坐标）
   * @param {string} dir - 方向
   * @param {number} labelWidth - 标签宽度（取中英文最大值）
   * @param {boolean} hasEn - 是否有英文标签
   * @returns {{x1,y1,x2,y2}} 边界框
   */
  function getLabelBox(dir, labelWidth, hasEn) {
    const cnFontSize = 13;
    const enFontSize = 10;
    const lineGap = 14;
    const cnAscent = cnFontSize * 0.85;
    const cnDescent = cnFontSize * 0.2;
    const enDescent = enFontSize * 0.2;

    const offset = getLabelOffset(dir);

    let x1, x2;
    if (offset.anchor === 'start') {
      x1 = offset.x;
      x2 = offset.x + labelWidth;
    } else if (offset.anchor === 'end') {
      x1 = offset.x - labelWidth;
      x2 = offset.x;
    } else {
      x1 = offset.x - labelWidth / 2;
      x2 = offset.x + labelWidth / 2;
    }

    const y1 = offset.y - cnAscent;
    const y2 = hasEn ? (offset.y + lineGap + enDescent) : (offset.y + cnDescent);

    return { x1, y1, x2, y2 };
  }

  /**
   * 自动计算站点标签的最佳位置
   * 原则：标签不能挡住任何线路。
   * 根据中英文文本长度估算标签边界框，检测与实际线路路径段的相交情况，
   * 选择不相交（或相交最少）的方向。优先基本方向，其次对角方向。
   * @param {Object} station - 站点对象
   * @param {Array} lines - 所有线路
   * @param {Array} stations - 所有站点
   * @returns {string} 位置标识符（如 'right', 'top' 等）
   */
  function computeAutoLabelPosition(station, lines, stations) {
    const stationMap = {};
    stations.forEach(s => { stationMap[s.id] = s; });

    const connectedLines = lines.filter(l => l.stationIds.includes(station.id));
    if (connectedLines.length === 0) return 'right';

    // 收集所有从该站点出发的线路路径段（相对站点坐标）
    const segments = [];
    for (const line of connectedLines) {
      const idx = line.stationIds.indexOf(station.id);
      const neighborIds = [];
      if (idx > 0) neighborIds.push(line.stationIds[idx - 1]);
      if (idx < line.stationIds.length - 1) neighborIds.push(line.stationIds[idx + 1]);

      for (const nid of neighborIds) {
        const neighbor = stationMap[nid];
        if (!neighbor) continue;

        const pathPoints = generatePath(station.x, station.y, neighbor.x, neighbor.y);
        for (let i = 0; i < pathPoints.length - 1; i++) {
          segments.push({
            x1: pathPoints[i].x - station.x,
            y1: pathPoints[i].y - station.y,
            x2: pathPoints[i + 1].x - station.x,
            y2: pathPoints[i + 1].y - station.y
          });
        }
      }
    }

    // 估算标签文本宽度（中英文取最大值）
    const cnWidth = estimateTextWidth(station.name, 13);
    const enWidth = estimateTextWidth(station.nameEn, 10);
    const labelWidth = Math.max(cnWidth, enWidth);
    const hasEn = !!station.nameEn;

    // 8 个候选方向
    const cardinal = ['top', 'bottom', 'left', 'right'];
    const diagonal = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const allDirs = [...cardinal, ...diagonal];

    // 统计每个方向的相交次数
    const dirCount = {};
    for (const dir of allDirs) {
      const box = getLabelBox(dir, labelWidth, hasEn);
      let count = 0;
      for (const seg of segments) {
        if (segmentIntersectsBox(seg.x1, seg.y1, seg.x2, seg.y2, box.x1, box.y1, box.x2, box.y2)) {
          count++;
        }
      }
      dirCount[dir] = count;
    }

    // 优先基本方向，选相交最少（优先为 0）的方向
    let bestDir = 'right';
    let minCount = Infinity;

    for (const dir of cardinal) {
      if (dirCount[dir] < minCount) {
        minCount = dirCount[dir];
        bestDir = dir;
      }
    }

    // 基本方向都相交时，再考虑对角方向
    if (minCount > 0) {
      for (const dir of allDirs) {
        if (dirCount[dir] < minCount) {
          minCount = dirCount[dir];
          bestDir = dir;
        }
      }
    }

    return bestDir;
  }

  /**
   * 根据标签位置计算标签的偏移
   */
  function getLabelOffset(position, radius = 18) {
    const offsets = {
      'top':         { x: 0, y: -radius - 6, anchor: 'middle' },
      'bottom':      { x: 0, y: radius + 16, anchor: 'middle' },
      'left':        { x: -radius - 6, y: 4, anchor: 'end' },
      'right':       { x: radius + 6, y: 4, anchor: 'start' },
      'top-left':    { x: -radius - 4, y: -radius - 4, anchor: 'end' },
      'top-right':   { x: radius + 4, y: -radius - 4, anchor: 'start' },
      'bottom-left': { x: -radius - 4, y: radius + 16, anchor: 'end' },
      'bottom-right':{ x: radius + 4, y: radius + 16, anchor: 'start' }
    };
    return offsets[position] || offsets['top'];
  }

  /**
   * 计算两点之间的距离
   */
  function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  /**
   * 找距离指定点最近的站点
   */
  function findNearestStation(x, y, stations, maxDist = 30) {
    let nearest = null;
    let minDist = maxDist;

    for (const station of stations) {
      const d = distance(x, y, station.x, station.y);
      if (d < minDist) {
        minDist = d;
        nearest = station;
      }
    }

    return nearest;
  }

  /**
   * 找距离指定点最近的文本块
   */
  function findNearestTextBlock(x, y, textBlocks, maxDist = 20) {
    let nearest = null;
    let minDist = maxDist;

    for (const tb of textBlocks) {
      const d = distance(x, y, tb.x, tb.y);
      if (d < minDist) {
        minDist = d;
        nearest = tb;
      }
    }

    return nearest;
  }

  /**
   * 生成经过多个站点的完整折线路径
   * @param {{x:number,y:number}[]} stations 站点坐标数组
   * @returns {{x: number, y: number}[]} 路径点数组
   */
  function generateMultiStationPath(stations) {
    if (stations.length < 2) return stations.slice();
    let allPoints = [{ x: stations[0].x, y: stations[0].y }];
    for (let i = 1; i < stations.length; i++) {
      const seg = generatePath(stations[i - 1].x, stations[i - 1].y, stations[i].x, stations[i].y);
      allPoints = allPoints.concat(seg.slice(1));
    }
    return simplifyPath(allPoints);
  }

  return {
    generatePath,
    generateMultiStationPath,
    pointsToPathData,
    pathLength,
    pathMidpoint,
    getLabelOffset,
    computeAutoLabelPosition,
    distance,
    findNearestStation,
    findNearestTextBlock,
    offsetPath
  };
})();