class LudoBoard {
    constructor() {
        // 玩家起点在全局路径上的偏移量
        this.startOffsets = {
            0: 0,  // Blue
            1: 13, // Red
            2: 26, // Green
            3: 39  // Yellow
        };

        // 安全格的全局索引 (0-51)
        // 通常起点是安全格，有些版本还有额外的星号格 (8, 21, 34, 47)
        this.safeZones = [0, 13, 26, 39, 8, 21, 34, 47];
    }

    // 将玩家的相对位置转换为全局位置
    // relativePos: 0-56
    // return: 
    //   -1: Base
    //   0-51: Global Path
    //   100+: Home Stretch (100 + color*10 + step)
    //   999: Finished
    getGlobalPos(playerColor, relativePos) {
        if (relativePos === -1) return -1; // Base
        if (relativePos === 999) return 999; // Finished

        if (relativePos <= 50) {
            // 在外圈公共路径上
            return (relativePos + this.startOffsets[playerColor]) % 52;
        } else {
            // 进入终点直道 (51-56)
            // 映射到 100, 101... 格式以便区分
            // 比如 Blue (0) 的直道是 100-105
            // Red (1) 的直道是 110-115
            const homeStep = relativePos - 51; 
            return 100 + (playerColor * 10) + homeStep;
        }
    }

    // 检查移动是否会吃子
    // 返回: Array of { victimPlayerId: number, victimPieceIndex: number }
    checkCapture(players, moverColor, moverPieceIndex, newRelativePos) {
        const newGlobalPos = this.getGlobalPos(moverColor, newRelativePos);
        const capturedPieces = [];

        // 如果在基地、终点或直道，不会发生吃子
        if (newGlobalPos === -1 || newGlobalPos >= 100) {
            return capturedPieces;
        }

        // 如果是安全格，不会发生吃子
        if (this.safeZones.includes(newGlobalPos)) {
            return capturedPieces;
        }

        // 检查该位置是否有其他玩家的棋子
        for (let p of players) {
            if (p.color === moverColor || !p.isActive) continue;

            for (let i = 0; i < 4; i++) {
                const enemyPos = p.pieces[i];
                const enemyGlobalPos = this.getGlobalPos(p.color, enemyPos);

                if (enemyGlobalPos === newGlobalPos) {
                    capturedPieces.push({
                        victimPlayerId: p.id,
                        victimPieceIndex: i
                    });
                }
            }
        }

        return capturedPieces;
    }
    
    // 获取棋盘上某个位置的所有棋子（用于UI显示重叠）
    getPiecesAtGlobalPos(players, globalPos) {
        let pieces = [];
        players.forEach(p => {
            if(!p.isActive) return;
            p.pieces.forEach((pos, idx) => {
                if(this.getGlobalPos(p.color, pos) === globalPos) {
                    pieces.push({player: p, pieceIdx: idx});
                }
            });
        });
        return pieces;
    }

    // 获取从 startPos 到 endPos 的每一步的全局坐标列表
    // 用于动画
    getStepPath(playerColor, startPos, endPos) {
        const path = [];
        
        // 1. 起飞 (从基地 -1 到 0)
        if (startPos === -1) {
            // 基地坐标
            // 注意：这里我们无法直接获取具体的基地坐标 (因为不知道是第几个棋子)
            // 但通常动画开始时，棋子已经在基地了，所以第一帧可以是基地，也可以直接是起点
            // 为了简化，我们假设调用者会处理起点的初始位置，这里只返回移动后的路径
            // 如果是起飞，目标就是 0
            path.push(this.getGlobalCoordinates(playerColor, 0));
            return path;
        }

        // 2. 正常移动
        // 从 startPos + 1 到 endPos
        for (let i = startPos + 1; i <= endPos; i++) {
            path.push(this.getGlobalCoordinates(playerColor, i));
        }
        
        return path;
    }

    // 获取被吃回家的路径 (倒退)
    getReturnPath(playerColor, currentPos) {
        const path = [];
        // 从 currentPos 倒退回 0
        for (let i = currentPos; i >= 0; i--) {
            path.push(this.getGlobalCoordinates(playerColor, i));
        }
        // 最后回到基地 (用 null 或特殊标记表示基地，或者由 UI 处理)
        // 这里我们返回 null 作为最后一步，表示消失/回基地
        path.push(null); 
        return path;
    }

    // 辅助：获取某个相对位置的 Canvas 坐标对象 {x, y}
    getGlobalCoordinates(playerColor, relativePos) {
        if (relativePos === -1) return null; // Base needs index
        if (relativePos === 999) return {x: 7.5, y: 7.5}; // Center

        const globalPos = this.getGlobalPos(playerColor, relativePos);
        
        if (globalPos >= 100) {
            const homeIdx = Math.floor((globalPos - 100) / 10);
            const step = globalPos % 10;
            return BOARD_COORDINATES.homes[homeIdx][step];
        } else {
            return BOARD_COORDINATES.global[globalPos];
        }
    }
}

// 坐标映射表 (用于 Canvas 绘制)
// 这是一个简化的映射，假设棋盘是 15x15 的网格
// 坐标系: x (0-14), y (0-14)
var BOARD_COORDINATES = {
    // 全局路径 0-51 的坐标
    global: [
        {x: 6, y: 13}, {x: 6, y: 12}, {x: 6, y: 11}, {x: 6, y: 10}, {x: 6, y: 9}, {x: 5, y: 8}, // 0-5 (Blue start area up)
        {x: 4, y: 8}, {x: 3, y: 8}, {x: 2, y: 8}, {x: 1, y: 8}, {x: 0, y: 8}, {x: 0, y: 7},     // 6-11 (Left arm top)
        {x: 0, y: 6}, {x: 1, y: 6}, {x: 2, y: 6}, {x: 3, y: 6}, {x: 4, y: 6}, {x: 5, y: 6},     // 12-17 (Left arm bottom, 13 is Red start)
        {x: 6, y: 5}, {x: 6, y: 4}, {x: 6, y: 3}, {x: 6, y: 2}, {x: 6, y: 1}, {x: 6, y: 0},     // 18-23 (Top arm left)
        {x: 7, y: 0}, {x: 8, y: 0},                                                             // 24-25 (Top center)
        {x: 8, y: 1}, {x: 8, y: 2}, {x: 8, y: 3}, {x: 8, y: 4}, {x: 8, y: 5}, {x: 9, y: 6},     // 26-31 (Top arm right, 26 is Green start)
        {x: 10, y: 6}, {x: 11, y: 6}, {x: 12, y: 6}, {x: 13, y: 6}, {x: 14, y: 6}, {x: 14, y: 7}, // 32-37 (Right arm top)
        {x: 14, y: 8}, {x: 13, y: 8}, {x: 12, y: 8}, {x: 11, y: 8}, {x: 10, y: 8}, {x: 9, y: 8},  // 38-43 (Right arm bottom, 39 is Yellow start)
        {x: 8, y: 9}, {x: 8, y: 10}, {x: 8, y: 11}, {x: 8, y: 12}, {x: 8, y: 13}, {x: 8, y: 14},  // 44-49 (Bottom arm right)
        {x: 7, y: 14}, {x: 6, y: 14}                                                            // 50-51 (Bottom center)
    ],
    // 终点直道
    homes: {
        0: [{x: 7, y: 13}, {x: 7, y: 12}, {x: 7, y: 11}, {x: 7, y: 10}, {x: 7, y: 9}, {x: 7, y: 8}], // Blue
        1: [{x: 1, y: 7}, {x: 2, y: 7}, {x: 3, y: 7}, {x: 4, y: 7}, {x: 5, y: 7}, {x: 6, y: 7}],     // Red
        2: [{x: 7, y: 1}, {x: 7, y: 2}, {x: 7, y: 3}, {x: 7, y: 4}, {x: 7, y: 5}, {x: 7, y: 6}],     // Green
        3: [{x: 13, y: 7}, {x: 12, y: 7}, {x: 11, y: 7}, {x: 10, y: 7}, {x: 9, y: 7}, {x: 8, y: 7}]  // Yellow
    },
    // 基地位置 (每个玩家4个棋子)
    bases: {
        0: [{x: 1, y: 10}, {x: 4, y: 10}, {x: 1, y: 13}, {x: 4, y: 13}], // Blue (Bottom Left)
        1: [{x: 1, y: 1}, {x: 4, y: 1}, {x: 1, y: 4}, {x: 4, y: 4}],     // Red (Top Left)
        2: [{x: 10, y: 1}, {x: 13, y: 1}, {x: 10, y: 4}, {x: 13, y: 4}], // Green (Top Right)
        3: [{x: 10, y: 10}, {x: 13, y: 10}, {x: 10, y: 13}, {x: 13, y: 13}] // Yellow (Bottom Right)
    }
};
