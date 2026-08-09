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
   * 自动计算站点标签的最佳位置
   * 分析站点连接的所有线路实际碰到站点的方向，选择线路未占用的方向放置标签
   * 注意：线路路径采用"先45°斜线再直线"算法，故以实际路径第一段方向为准，
   * 而非站点到邻居的直线方向。
   * @param {Object} station - 站点对象
   * @param {Array} lines - 所有线路
   * @param {Array} stations - 所有站点
   * @returns {string} 位置标识符（如 'right', 'top' 等）
   */
  function computeAutoLabelPosition(station, lines, stations) {
    const stationMap = {};
    stations.forEach(s => { stationMap[s.id] = s; });

    // 8 个方向，统计每个方向被线路碰到的次数
    const dirCount = {
      'right': 0, 'bottom-right': 0, 'bottom': 0, 'bottom-left': 0,
      'left': 0, 'top-left': 0, 'top': 0, 'top-right': 0
    };
    const dirMap = ['right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left', 'top', 'top-right'];

    // 遍历所有包含该站点的线路
    const connectedLines = lines.filter(l => l.stationIds.includes(station.id));

    if (connectedLines.length === 0) {
      return 'right';
    }

    for (const line of connectedLines) {
      const idx = line.stationIds.indexOf(station.id);
      const neighborIds = [];
      if (idx > 0) neighborIds.push(line.stationIds[idx - 1]);
      if (idx < line.stationIds.length - 1) neighborIds.push(line.stationIds[idx + 1]);

      for (const nid of neighborIds) {
        const neighbor = stationMap[nid];
        if (!neighbor) continue;

        // 生成实际路径，取第一段方向（即线路碰到站点的真实方向）
        const pathPoints = generatePath(station.x, station.y, neighbor.x, neighbor.y);
        if (pathPoints.length < 2) continue;

        const segDx = pathPoints[1].x - pathPoints[0].x;
        const segDy = pathPoints[1].y - pathPoints[0].y;
        if (Math.abs(segDx) < 1 && Math.abs(segDy) < 1) continue;

        // atan2: 0=右, PI/2=下(SVG坐标), PI=左, -PI/2=上
        const deg = (Math.atan2(segDy, segDx) * 180 / Math.PI + 360) % 360;
        const sector = Math.round(deg / 45) % 8;
        dirCount[dirMap[sector]]++;
      }
    }

    // 优先选择基本方向（上下左右），其次对角方向
    const cardinal = ['top', 'bottom', 'left', 'right'];
    const diagonal = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const allDirs = [...cardinal, ...diagonal];

    let bestDir = 'right';
    let minCount = Infinity;

    // 第一轮：只看基本方向
    for (const dir of cardinal) {
      if (dirCount[dir] < minCount) {
        minCount = dirCount[dir];
        bestDir = dir;
      }
    }

    // 如果基本方向都有线路，再看对角方向
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