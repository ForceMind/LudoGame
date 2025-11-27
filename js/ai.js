class AIController {
    constructor() {
        this.mode = 'BALANCED'; // SUPPORT, BALANCED, CHALLENGE
        this.lastDebugInfo = {};
    }

    // 1. 玩家预测胜率计算
    calculatePredictedWinRate(player) {
        // 结构分
        let homeCount = 0;
        let roadCount = 0;
        let safeCount = 0;
        let finishedCount = player.finishedPieces;

        // 假设 board 实例可以从外部获取或者这里简化判断
        // 由于这里没有 board 实例，我们只能根据 pos 判断
        // -1: Home
        // 999: Finished
        // Others: Road. Safe zones need board logic, assume 0 for now or simplified
        
        // 为了准确计算，我们需要 board 信息。
        // 这里我们假设 safe zones 是固定的: 0, 8, 13, 21, 26, 34, 39, 47 (相对位置需要转换)
        // 简化：只算 Home, Road, Finished
        
        player.pieces.forEach(pos => {
            if (pos === -1) homeCount++;
            else if (pos === 999) { /* already counted in finishedPieces */ }
            else {
                // 简单判断是否在安全区 (需要 board 上下文，这里暂时忽略安全区加分，归为路上的分)
                roadCount++;
            }
        });

        // 修正：finishedPieces 已经在 player 属性里，但 pieces 数组里也有 999
        // 避免重复计数
        
        const structureScore = (homeCount * 5 + roadCount * 15 + safeCount * 20 + finishedCount * 25); 
        // 注意：用户公式是 / 100。如果满分是 100，结果是 0-1。
        
        // 进度分
        const totalSteps = 56 * 4; // 224
        let remainingSteps = 0;
        player.pieces.forEach(pos => {
            if (pos === -1) remainingSteps += 56;
            else if (pos === 999) remainingSteps += 0;
            else remainingSteps += (56 - pos);
        });
        
        // 进度分 = (1 - 剩余/总) * 100 (解释为完成度)
        // 用户原文：进度分 = 所有棋子到达终点剩余步数/总步数
        // 如果按原文，开始是 1，结束是 0。
        // 胜率公式：(0.5 * 结构 + 0.5 * 进度) / 100
        // 如果结构分是 0-100，进度分是 0-1。这量级不对。
        // 假设进度分也是 0-100。即 (1 - remaining/total) * 100
        const progressScore = (1 - remainingSteps / totalSteps) * 100;

        const predictedWinRate = (0.5 * structureScore + 0.5 * progressScore) / 100;
        return predictedWinRate; // 返回 0 - 1
    }

    // 骰子控制逻辑
    rollDice(isHumanTurn, context) {
        const { players, currentPlayerId, board } = context;
        const player = players[currentPlayerId];
        
        // 预先计算所有人的胜率，用于显示
        const allWinRates = players.map(p => this.calculatePredictedWinRate(p));

        this.lastDebugInfo = {
            player: player.name,
            isHuman: !player.isBot,
            trigger: 'Normal',
            winRate: allWinRates[player.id],
            allWinRates: allWinRates, // 存储所有人的胜率
            avgWinRate: 0,
            diff: 0,
            influence: 0,
            probA: 0,
            roll: 0
        };

        // ---------------------------------------------------------
        // 8. 干预终点到达 (End Game Intervention)
        // ---------------------------------------------------------
        if (isHumanTurn && player.finishedPieces === 3) {
            // 检查最后一个棋子距离是否 <= 14
            let lastPiecePos = -1;
            for(let p of player.pieces) {
                if (p !== 999) {
                    lastPiecePos = p;
                    break;
                }
            }
            
            if (lastPiecePos !== -1) {
                const distance = 56 - lastPiecePos; // 假设 56 是终点
                if (distance <= 14) {
                    console.log("Trigger: End Game Intervention");
                    this.lastDebugInfo.trigger = 'EndGame Intervention';
                    const roll = this.rollDiceEndGame();
                    this.lastDebugInfo.roll = roll;
                    return roll;
                }
            }
        }

        // ---------------------------------------------------------
        // 5. 干预打人事件 (Capture Intervention)
        // ---------------------------------------------------------
        if (isHumanTurn) {
            const captureRoll = this.checkCaptureIntervention(player, context);
            if (captureRoll !== null) {
                console.log("Trigger: Capture Intervention -> " + captureRoll);
                this.lastDebugInfo.trigger = 'Capture Intervention';
                this.lastDebugInfo.roll = captureRoll;
                return captureRoll;
            }
        }

        // ---------------------------------------------------------
        // 4. 正常逻辑 (Sigmoid Probability)
        // ---------------------------------------------------------
        const roll = this.rollDiceSigmoid(player, players, allWinRates);
        this.lastDebugInfo.roll = roll;
        return roll;
    }

    // 4. Sigmoid 骰子逻辑
    rollDiceSigmoid(player, players, preCalculatedRates) {
        // 计算所有玩家的预测胜率 (如果没传就现算)
        let predictedRates = preCalculatedRates;
        if (!predictedRates) {
            predictedRates = players.map(p => this.calculatePredictedWinRate(p));
        }
        
        let totalPredicted = predictedRates.reduce((a, b) => a + b, 0);

        const userPredicted = predictedRates[player.id]; // 假设 id 对应索引
        const avgPredicted = totalPredicted / players.length;

        // 胜率差值
        const winRateDiff = userPredicted - avgPredicted;

        // 基础胜率平衡值
        const recentWinRate = UserAccount.getRecentWinRate();
        const baseBalanceValue = recentWinRate - 0.5;
        
        this.lastDebugInfo.winRate = userPredicted;
        this.lastDebugInfo.avgWinRate = avgPredicted;
        this.lastDebugInfo.diff = winRateDiff;

        if (player.isBot) {
            this.lastDebugInfo.trigger = 'Bot Random';
            return Utils.randomInt(1, 6);
        }

        // 人类玩家逻辑
        const influenceParam = winRateDiff + baseBalanceValue + 1.6;
        this.lastDebugInfo.influence = influenceParam;
        
        // A 组合 (1-5) 概率
        const probA = Math.exp(influenceParam) / (1 + Math.exp(influenceParam));
        this.lastDebugInfo.probA = probA;
        
        // 随机选择组合
        const isGroupA = Math.random() < probA;

        if (isGroupA) {
            this.lastDebugInfo.trigger = 'Sigmoid Group A (1-5)';
            return Utils.randomInt(1, 5);
        } else {
            this.lastDebugInfo.trigger = 'Sigmoid Group B (6)';
            return 6;
        }
    }

    // 5-7. 打人干预逻辑
    checkCaptureIntervention(player, context) {
        // 触发概率 60%
        if (Math.random() > 0.6) return null;

        const { players, board } = context;
        
        // 寻找可行的吃子点数
        for (let dice = 1; dice <= 6; dice++) {
            // 检查是否有棋子在路上
            for (let i = 0; i < 4; i++) {
                const pos = player.pieces[i];
                if (pos !== -1 && pos !== 999) {
                    // 检查前方 6 步内是否有敌军
                    // 这里简化：直接看 dice 是否能吃
                    // 题目要求：前方 6 个距离内有...
                    // 我们遍历 1-6，看哪个能吃
                    
                    // 模拟移动
                    if (player.isValidMove(i, dice)) {
                        const newPos = pos + dice;
                        const capture = board.checkCapture(players, player.color, i, newPos);
                        
                        if (capture) {
                            const victim = players.find(p => p.id === capture.victimPlayerId);
                            // 检查是否在安全区 (checkCapture 已经处理了安全区不吃，所以这里 capture 存在意味着不在安全区)
                            
                            // 6. 预测胜率变化
                            const oldRate = this.calculatePredictedWinRate(victim);
                            
                            // 模拟被吃后的状态
                            const originalPos = victim.pieces[capture.victimPieceIndex];
                            victim.pieces[capture.victimPieceIndex] = -1; // 回家
                            const newRate = this.calculatePredictedWinRate(victim);
                            victim.pieces[capture.victimPieceIndex] = originalPos; // 恢复
                            
                            const diff = oldRate - newRate;
                            
                            // 变化值变小范围在 30% 以内 (即下降不超过 0.3)
                            if (diff < 0.3) {
                                return dice;
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    // 8. 终点干预逻辑
    rollDiceEndGame() {
        const recentWinRate = UserAccount.getRecentWinRate();
        const baseBalanceValue = recentWinRate - 0.5;
        
        const groupA = [3, 5, 6];
        const groupB = [1, 2, 4];
        
        let probA = 0; // Default

        if (baseBalanceValue > 0.1) {
            probA = 1.0;
        } else if (baseBalanceValue < -0.08) {
            probA = 0.0;
        } else if (baseBalanceValue > 0) {
            probA = 0.8;
        } else { // < 0
            probA = 0.2;
        }

        const useGroupA = Math.random() < probA;
        const group = useGroupA ? groupA : groupB;
        
        return group[Math.floor(Math.random() * group.length)];
    }

    // AI 走子决策 (保持不变)
    decideMove(player, diceValue, board, players) {
        const movablePieces = player.getMovablePieces(diceValue);
        if (movablePieces.length === 0) return null;
        
        // 简单 AI：优先吃子，优先进终点
        // 这里不再使用复杂的 Support/Challenge 逻辑，因为骰子已经控制了胜率
        // 保持一个中等智能的 AI
        
        let bestScore = -Infinity;
        let bestPiece = movablePieces[0];

        movablePieces.forEach(pieceIdx => {
            let score = 0;
            const currentPos = player.pieces[pieceIdx];
            const newPos = currentPos === -1 ? 0 : currentPos + diceValue;
            
            // 吃子
            const capture = board.checkCapture(players, player.color, pieceIdx, newPos);
            if (capture) score += 100;

            // 起飞
            if (currentPos === -1) score += 50;

            // 进终点
            if (newPos === 56) score += 200;

            // 安全格
            const globalPos = board.getGlobalPos(player.color, newPos);
            if (board.safeZones.includes(globalPos)) score += 20;

            score += Math.random() * 10; // 随机性

            if (score > bestScore) {
                bestScore = score;
                bestPiece = pieceIdx;
            }
        });

        return bestPiece;
    }
    
    // 兼容旧代码调用 (updateMode 不再需要，但为了不报错保留空函数)
    updateMode() {}
}