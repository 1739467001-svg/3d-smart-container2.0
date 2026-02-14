import { CargoItem, Dimensions, ImportedRow } from '../types';

// --- 颜色配置 ---
// 用于给不同类型的货物分配醒目的颜色，方便视觉区分
const DISTINCT_COLORS = [
  '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#84cc16', 
  '#14b8a6', '#d946ef', '#e11d48', '#2563eb', '#9333ea', 
  '#059669', '#d97706', '#db2777', '#0891b2', '#4f46e5'
];

// 简单的哈希函数：根据字符串（如Drawing No）生成固定的颜色
const getStringColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % DISTINCT_COLORS.length;
  return DISTINCT_COLORS[index];
};

// --- 算法内部使用的类型定义 ---

// Box 代表一个“空间块”。既可以是物体占用的空间，也可以是还未被填充的“剩余自由空间”
interface Box {
  x: number; // 起点 X 坐标 (长度方向)
  y: number; // 起点 Y 坐标 (高度方向)
  z: number; // 起点 Z 坐标 (宽度/深度方向)
  l: number; // Length (X轴跨度)
  h: number; // Height (Y轴跨度)
  w: number; // Width  (Z轴跨度)
}

// --- 辅助函数 ---

/**
 * 纯坐标碰撞检测
 * 不依赖 CargoItem 对象，直接根据坐标和尺寸判断
 */
export const checkCollisionWithCoords = (
  target: { x: number, y: number, z: number, l: number, h: number, w: number, id: string },
  others: CargoItem[],
  container: Dimensions
): boolean => {
  const ix1 = target.x;
  const iy1 = target.y;
  const iz1 = target.z;
  const ix2 = ix1 + target.l;
  const iy2 = iy1 + target.h;
  const iz2 = iz1 + target.w;

  // 1. 基础物理边界检查
  // 只限制不能钻入地下 (y < 0) 或 跑到原点负方向 (x < 0, z < 0)
  // **关键修改**: 移除了对 container.length/width/height 的上限检查
  // 这样允许物体在待装区(Staging Area)移动，或者被举高以便跨越其他物体
  if (ix1 < 0 || iy1 < 0 || iz1 < 0) return true;
  
  // 2. 检查与其他所有物体的重叠情况
  for (const other of others) {
    if (other.id === target.id) continue; // 跳过自己
    const ox1 = other.position[0];
    const oy1 = other.position[1];
    const oz1 = other.position[2];
    const ox2 = ox1 + other.dimensions.length;
    const oy2 = oy1 + other.dimensions.height;
    const oz2 = oz1 + other.dimensions.width;

    // AABB 重叠判定公式
    // 使用 epsilon 容差防止浮点数精度问题导致的“接触即碰撞”
    const epsilon = 1; 
    const overlap = (
      ix1 < ox2 - epsilon && ix2 > ox1 + epsilon &&
      iy1 < oy2 - epsilon && iy2 > oy1 + epsilon &&
      iz1 < oz2 - epsilon && iz2 > oz1 + epsilon
    );

    if (overlap) return true;
  }
  return false;
}

/**
 * 碰撞检测 (AABB - Axis-Aligned Bounding Box)
 * 用于实时检测手动拖拽时，当前物体是否和容器边界或其物体重叠
 */
export const checkCollision = (item: CargoItem, others: CargoItem[], container: Dimensions): boolean => {
  return checkCollisionWithCoords({
    x: item.position[0],
    y: item.position[1],
    z: item.position[2],
    l: item.dimensions.length,
    h: item.dimensions.height,
    w: item.dimensions.width,
    id: item.id
  }, others, container);
};

/**
 * 磁吸位置计算 (Magnetic Snapping)
 * 当物体靠近其他物体边缘时，自动吸附过去
 */
export const getSnappingPosition = (
  currentPos: [number, number, number],
  dims: Dimensions,
  others: CargoItem[],
  id: string,
  threshold: number = 150 // 吸附半径 mm
): [number, number, number] => {
  let [newX, newY, newZ] = currentPos;
  
  // 基础吸附：吸附到 0 点
  if (Math.abs(newX) < threshold) newX = 0;
  if (Math.abs(newY) < threshold) newY = 0;
  if (Math.abs(newZ) < threshold) newZ = 0;

  for (const other of others) {
    if (other.id === id) continue;

    const ox = other.position[0];
    const oy = other.position[1];
    const oz = other.position[2];
    const ol = other.dimensions.length;
    const oh = other.dimensions.height;
    const ow = other.dimensions.width;

    // --- X轴吸附 ---
    // 我的左边 吸 他的右边
    if (Math.abs(newX - (ox + ol)) < threshold) newX = ox + ol;
    // 我的右边 吸 他的左边
    if (Math.abs((newX + dims.length) - ox) < threshold) newX = ox - dims.length;
    // 对齐：我的左边 吸 他的左边
    if (Math.abs(newX - ox) < threshold) newX = ox;
     // 对齐：我的右边 吸 他的右边
    if (Math.abs((newX + dims.length) - (ox + ol)) < threshold) newX = ox + ol - dims.length;


    // --- Y轴吸附 (垂直堆叠关键) ---
    // 我的底部 吸 他的顶部
    if (Math.abs(newY - (oy + oh)) < threshold) newY = oy + oh;
    // 我的顶部 吸 他的底部
    if (Math.abs((newY + dims.height) - oy) < threshold) newY = oy - dims.height;


    // --- Z轴吸附 ---
    // 我的后边 吸 他的前边
    if (Math.abs(newZ - (oz + ow)) < threshold) newZ = oz + ow;
    // 我的前边 吸 他的后边
    if (Math.abs((newZ + dims.width) - oz) < threshold) newZ = oz - dims.width;
    // 对齐
    if (Math.abs(newZ - oz) < threshold) newZ = oz;
    if (Math.abs((newZ + dims.width) - (oz + ow)) < threshold) newZ = oz + ow - dims.width;
  }

  return [newX, newY, newZ];
};

/**
 * 将 CSV 导入的行数据转换为独立的货物对象
 */
export const createCargoGroups = (rows: ImportedRow[]): CargoItem[] => {
  const cargoItems: CargoItem[] = [];
  rows.forEach((row, rowIdx) => {
    // 优先使用 SubDrawingNo 作为唯一标识，否则使用 MainDrawingNo
    const identifier = row.subDrawingNo && row.subDrawingNo.trim() !== '' ? row.subDrawingNo : row.mainDrawingNo;
    const itemColor = getStringColor(identifier);

    // 根据 Quantity 数量，生成对应个数的独立 Item
    for (let i = 0; i < row.quantity; i++) {
      cargoItems.push({
        id: `item-${rowIdx}-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        drawingNo: row.mainDrawingNo,
        subDrawingNo: row.subDrawingNo,
        dimensions: { length: row.length, width: row.width, height: row.height },
        position: [0, 0, 0], 
        color: itemColor,
        weight: row.weight,
        selected: false,
        isValid: true,
        isGroup: false,
        subItems: []
      });
    }
  });
  return cargoItems;
};

/**
 * 待装载区排列逻辑
 * 简单的二维排列，防止货物堆在一起，方便用户手动选取
 */
export const arrangeStaging = (items: CargoItem[], container: Dimensions): CargoItem[] => {
  const spacing = 100;
  const stagingZStart = container.width + 1500; // 放在集装箱侧面
  const stagingWidthLimit = 15000;
  let currentX = 0;
  let currentZ = stagingZStart;
  let maxZInRow = 0;

  return items.map(item => {
    // 换行逻辑
    if (currentX + item.dimensions.length > stagingWidthLimit) {
      currentX = 0;
      currentZ += maxZInRow + spacing;
      maxZInRow = 0;
    }
    const pos: [number, number, number] = [currentX, 0, currentZ];
    currentX += item.dimensions.length + spacing;
    maxZInRow = Math.max(maxZInRow, item.dimensions.width);
    return { ...item, position: pos, isValid: true };
  });
};

// --- 核心装箱算法实现 ---

/*
  算法名称：多重起点随机贪婪算法 (Multi-Start Randomized Greedy)
  
  原理：
  单一的装箱策略（如只按体积从大到小排）往往会陷入局部最优。
  例如：先把大长条放进去了，结果挡住了后面大方块的位置。
  
  为了解决这个问题，我们采用“元启发式”思想：
  1. 跑多轮模拟（Trials）。
  2. 每一轮使用不同的排序策略（按体积排、按底面积排、按长边排）。
  3. 甚至引入“随机扰动”（Mutation），打破原有顺序，模拟遗传变异。
  4. 最后在所有模拟结果中，选出装载体积最大的那个方案。
*/

type SortStrategy = 'VOLUME' | 'FOOTPRINT' | 'MAX_DIM' | 'RANDOM_WEIGHTED';

interface TrialResult {
  items: CargoItem[]; // 装箱后的物品列表
  packedVolume: number; // 总装载体积
  packedCount: number; // 成功装入的数量
}

/**
 * 执行单次装箱尝试 (The Core Packer)
 * 这里实现了“剩余空间管理” (Free Space Management) 算法
 */
const runPackingTrial = (
  items: CargoItem[], 
  container: Dimensions, 
  strategy: SortStrategy,
  randomSeed: number // 随机种子，用于生成可复现的随机序列
): TrialResult => {
  
  // 1. 策略排序：决定谁先装
  // 好的排序是成功的一半。通常“先大后小”是基础。
  const itemsToPack = [...items].sort((a, b) => {
    // 计算基础几何属性
    const volA = a.dimensions.length * a.dimensions.width * a.dimensions.height;
    const volB = b.dimensions.length * b.dimensions.width * b.dimensions.height;
    const areaA = a.dimensions.length * a.dimensions.width;
    const areaB = b.dimensions.length * b.dimensions.width;
    const maxDimA = Math.max(a.dimensions.length, a.dimensions.width, a.dimensions.height);
    const maxDimB = Math.max(b.dimensions.length, b.dimensions.width, b.dimensions.height);

    let score = 0;

    switch (strategy) {
      case 'VOLUME':
        score = volB - volA; // 纯体积优先
        break;
      case 'FOOTPRINT': 
        // 底面积优先：适合需要稳固底盘的场景
        if (areaA !== areaB) score = areaB - areaA;
        else score = volB - volA;
        break;
      case 'MAX_DIM':
        // 最长边优先：先把难塞的长条塞进去
        if (maxDimA !== maxDimB) score = maxDimB - maxDimA;
        else score = volB - volA;
        break;
      case 'RANDOM_WEIGHTED':
        // 带随机扰动的体积优先：
        // 模拟“退火”或“变异”。在体积排序的基础上增加随机噪音。
        // 这让算法有机会发现反直觉的组合。
        const noiseA = Math.sin(a.id.length + randomSeed) * 0.2; 
        const noiseB = Math.sin(b.id.length + randomSeed) * 0.2;
        score = (volB * (1 + noiseB)) - (volA * (1 + noiseA));
        break;
    }
    
    // 次级排序：如果分数接近，按高度降序，保持层级整齐
    if (Math.abs(score) < 0.1) {
        return b.dimensions.height - a.dimensions.height;
    }
    return score;
  });

  // 2. 初始化剩余空间列表 (Free Spaces)
  // 一开始，整个集装箱就是一个巨大的剩余空间
  let freeSpaces: Box[] = [{
    x: 0, y: 0, z: 0, 
    l: container.length, h: container.height, w: container.width 
  }];

  const placedItems: CargoItem[] = [];
  let totalPackedVol = 0;

  // 3. 逐个尝试放入物品
  for (const item of itemsToPack) {
    let bestSpaceIndex = -1;
    let bestRotation = false; // false=正常, true=旋转90度(交换长宽)
    let bestScore = Infinity; // 分数越小越好

    // 遍历每一个剩余空间，寻找最佳落脚点
    for (let i = 0; i < freeSpaces.length; i++) {
      const space = freeSpaces[i];
      
      // --- 尝试姿态 A: 正常放置 ---
      if (item.dimensions.length <= space.l && item.dimensions.height <= space.h && item.dimensions.width <= space.w) {
        // 评分公式 (Heuristic Score):
        // 我们希望物体尽可能靠下(Y)、靠里(Z)、靠左(X)。
        // Y轴权重最大(模拟重力)，Z轴次之(从里往外装)，X轴最小。
        const score = (space.y * 1000000) + (space.z * 1000) + space.x;
        if (score < bestScore) {
          bestScore = score;
          bestSpaceIndex = i;
          bestRotation = false;
        }
      }

      // --- 尝试姿态 B: 旋转放置 (水平旋转90度) ---
      // 只有当长宽不等时才有尝试价值
      if (item.dimensions.length !== item.dimensions.width) {
        // 注意：这里是比较 物品的Width vs 空间的Length，物品的Length vs 空间的Width
        if (item.dimensions.width <= space.l && item.dimensions.height <= space.h && item.dimensions.length <= space.w) {
           const score = (space.y * 1000000) + (space.z * 1000) + space.x;
           if (score < bestScore) {
             bestScore = score;
             bestSpaceIndex = i;
             bestRotation = true;
           }
        }
      }
    }

    if (bestSpaceIndex !== -1) {
      // --- 放置成功 (Placement Success) ---
      const space = freeSpaces[bestSpaceIndex];
      
      // 确定最终尺寸（是否旋转）
      const placedWidth = bestRotation ? item.dimensions.length : item.dimensions.width;
      const placedLength = bestRotation ? item.dimensions.width : item.dimensions.length;
      
      const finalDimensions = bestRotation 
        ? { ...item.dimensions, length: placedLength, width: placedWidth }
        : item.dimensions;

      // 创建新物体状态
      const newItem: CargoItem = {
        ...item,
        dimensions: finalDimensions,
        position: [space.x, space.y, space.z],
        isValid: true
      };
      
      placedItems.push(newItem);
      totalPackedVol += (newItem.dimensions.length * newItem.dimensions.width * newItem.dimensions.height);

      // --- 关键步骤：空间分割 (Space Splitting) ---
      // 当我们在一个“空盒子”里放了一个物体，这个空盒子就被占据了。
      // 但物体通常比盒子小，所以会剩下新的空间（上、下、左、右、前、后）。
      // 我们需要计算新的剩余空间列表。
      
      const placedBox: Box = { 
        x: space.x, y: space.y, z: space.z, 
        l: placedLength, h: item.dimensions.height, w: placedWidth 
      };
      
      const newFreeSpaces: Box[] = [];
      
      // 遍历现有的每一个自由空间，减去被占据的部分
      for (const fs of freeSpaces) {
        // 如果这个自由空间和新放的物体有交集，就需要切割
        if (boxIntersect(fs, placedBox)) {
          // 切割逻辑：生成最多6个新的矩形空间
          
          // 1. 右侧剩余空间
          if (placedBox.x + placedBox.l < fs.x + fs.l) { 
            newFreeSpaces.push({ ...fs, x: Math.max(fs.x, placedBox.x + placedBox.l), l: (fs.x + fs.l) - Math.max(fs.x, placedBox.x + placedBox.l) });
          }
          // 2. 左侧剩余空间
          if (placedBox.x > fs.x) { 
             newFreeSpaces.push({ ...fs, l: placedBox.x - fs.x });
          }
          // 3. 上方剩余空间 (Top) - 支持堆叠的关键
          if (placedBox.y + placedBox.h < fs.y + fs.h) { 
             newFreeSpaces.push({ ...fs, y: Math.max(fs.y, placedBox.y + placedBox.h), h: (fs.y + fs.h) - Math.max(fs.y, placedBox.y + placedBox.h) });
          }
          // 4. 前方剩余空间 (Front/Outwards)
          if (placedBox.z + placedBox.w < fs.z + fs.w) { 
             newFreeSpaces.push({ ...fs, z: Math.max(fs.z, placedBox.z + placedBox.w), w: (fs.z + fs.w) - Math.max(fs.z, placedBox.z + placedBox.w) });
          }
          // 5. 后方剩余空间 (Back)
          if (placedBox.z > fs.z) { 
             newFreeSpaces.push({ ...fs, w: placedBox.z - fs.z });
          }
          // (底部一般不需要，因为我们是从下往上堆)
        } else {
          // 没有交集，保持原样
          newFreeSpaces.push(fs);
        }
      }
      
      // 清理优化：移除那些被包含在其他大空间里的小空间，防止计算量爆炸
      freeSpaces = cleanupSpaces(newFreeSpaces);

    } else {
      // --- 放置失败 (Placement Failed) ---
      // 没有任何空间能塞下这个物体
      placedItems.push({
        ...item,
        position: [0, -9999, 0], // 给个无效坐标
        isValid: false
      });
    }
  }

  return {
    items: placedItems,
    packedVolume: totalPackedVol,
    packedCount: placedItems.filter(i => i.isValid).length
  };
};

/**
 * 主入口函数：自动装箱 (Auto Pack Manager)
 * 负责调度多次试验，并选出最佳结果
 */
export const autoPack = (items: CargoItem[], container: Dimensions): CargoItem[] => {
  // 定义要进行比拼的策略列表
  const trials: { strategy: SortStrategy, seed: number }[] = [
    { strategy: 'VOLUME', seed: 0 },         // 基准线：按体积贪婪
    { strategy: 'FOOTPRINT', seed: 0 },      // 策略2：按占地面积贪婪
    { strategy: 'MAX_DIM', seed: 0 },        // 策略3：按最长边贪婪
    // 元启发式随机尝试 (模拟遗传变异)
    // 使用不同的种子，让排序产生随机抖动，探索未知的可能性
    { strategy: 'RANDOM_WEIGHTED', seed: 1 }, 
    { strategy: 'RANDOM_WEIGHTED', seed: 42 },
    { strategy: 'RANDOM_WEIGHTED', seed: 123 },
    { strategy: 'RANDOM_WEIGHTED', seed: 999 },
  ];

  let bestResult: TrialResult | null = null;

  // 并行(同步)运行所有试验
  for (const trial of trials) {
    const result = runPackingTrial(items, container, trial.strategy, trial.seed);
    
    // 择优标准：目前只看“装载总体积”最大化
    if (!bestResult || result.packedVolume > bestResult.packedVolume) {
      bestResult = result;
    }
  }

  // 最终处理
  if (!bestResult) return items;

  const success = bestResult.items.filter(i => i.isValid);
  const failed = bestResult.items.filter(i => !i.isValid);
  
  // 失败的物品放回待装区
  const stagedFailed = arrangeStaging(failed, container);

  return [...success, ...stagedFailed];
};

export const optimizeLoad = (
  rawRows: ImportedRow[],
  container: Dimensions
): CargoItem[] => {
  const items = createCargoGroups(rawRows);
  return autoPack(items, container);
};


// --- 几何工具函数 ---

// 判断两个盒子是否相交
function boxIntersect(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.l &&
    a.x + a.l > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y &&
    a.z < b.z + b.w &&
    a.z + a.w > b.z
  );
}

// 空间清理：移除冗余空间
function cleanupSpaces(spaces: Box[]): Box[] {
  // 排序有助于加速包含检测
  spaces.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  const result: Box[] = [];
  const MIN_DIM = 50; // 忽略小于 50mm 的碎片空间，提高性能
  
  const validSizeSpaces = spaces.filter(s => s.l >= MIN_DIM && s.w >= MIN_DIM && s.h >= MIN_DIM);

  for (let i = 0; i < validSizeSpaces.length; i++) {
    let isContained = false;
    // 检查空间 i 是否完全被包含在空间 j 里面
    for (let j = 0; j < validSizeSpaces.length; j++) {
      if (i === j) continue;
      if (contains(validSizeSpaces[j], validSizeSpaces[i])) {
        isContained = true; // 如果被包含了，这个空间就是多余的
        break;
      }
    }
    if (!isContained) {
      result.push(validSizeSpaces[i]);
    }
  }
  return result;
}

// 判断 outer 是否完全包含 inner
function contains(outer: Box, inner: Box): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.z <= inner.z &&
    outer.x + outer.l >= inner.x + inner.l &&
    outer.y + outer.h >= inner.y + inner.h &&
    outer.z + outer.w >= inner.z + inner.w
  );
}