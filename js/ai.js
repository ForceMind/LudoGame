class AIController {
    constructor() {
        this.mode = 'BALANCED'; // SUPPORT, BALANCED, CHALLENGE
        this.lastDebugInfo = {};
        this.consecutiveCaptures = 0; // 记录当前回合连续触发吃子干预的次数
        this.lastPlayerId = -1; // 记录上一次行动的玩家ID
        
        // 保底机制状态
        this.noMoveCounts = {}; // playerId -> count
        this.failsafeThresholds = {}; // playerId -> threshold (10-20)
    }

    notifyNoMove(playerId) {
        if (this.noMoveCounts[playerId] === undefined) this.noMoveCounts[playerId] = 0;
        if (!this.failsafeThresholds[playerId]) this.failsafeThresholds[playerId] = Utils.randomInt(10, 20);
        
        this.noMoveCounts[playerId]++;
        console.log(`Player ${playerId} no move count: ${this.noMoveCounts[playerId]}/${this.failsafeThresholds[playerId]}`);
    }

    notifyMove(playerId) {
        this.noMoveCounts[playerId] = 0;
        this.failsafeThresholds[playerId] = Utils.randomInt(10, 20);
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
        
        // 如果玩家切换了，重置连续吃子计数器
        if (currentPlayerId !== this.lastPlayerId) {
            this.consecutiveCaptures = 0;
            this.lastPlayerId = currentPlayerId;
        }

        // 预先计算所有人的胜率，用于显示
        const allWinRates = players.map(p => this.calculatePredictedWinRate(p));

        // ---------------------------------------------------------
        // 0. 保底机制 (Failsafe)
        // ---------------------------------------------------------
        // 如果玩家连续多次无法移动 (死局保护)
        if (this.noMoveCounts[player.id] >= (this.failsafeThresholds[player.id] || 15)) {
            const failsafeRoll = this.getFailsafeRoll(player);
            if (failsafeRoll !== null) {
                console.log("Trigger: Failsafe (Stuck Protection) -> " + failsafeRoll);
                
                // 填充 debug info
                this.lastDebugInfo = {
                    player: player.name,
                    isHuman: !player.isBot,
                    trigger: 'Failsafe (Stuck)',
                    winRate: allWinRates[player.id],
                    allWinRates: allWinRates,
                    avgWinRate: 0, diff: 0, influence: 0, probA: 0, captureProb: 0,
                    roll: failsafeRoll
                };
                return failsafeRoll;
            }
        }

        // 计算胜率差值和基础平衡值
        let totalPredicted = allWinRates.reduce((a, b) => a + b, 0);
        const userPredicted = allWinRates[player.id];
        const avgPredicted = totalPredicted / players.length;
        const winRateDiff = userPredicted - avgPredicted;

        const recentWinRate = UserAccount.getRecentWinRate();
        let baseBalanceValue = recentWinRate - 0.5;

        // 关键修改：如果是电脑，反转平衡值
        // 玩家胜率高 (baseBalanceValue > 0) -> 玩家受限 (Influence +) -> 电脑获得增强 (Influence -)
        // 玩家胜率低 (baseBalanceValue < 0) -> 玩家获助 (Influence -) -> 电脑受限 (Influence +)
        if (!isHumanTurn) {
            baseBalanceValue = -baseBalanceValue;
        }

        this.lastDebugInfo = {
            player: player.name,
            isHuman: !player.isBot,
            trigger: 'Normal',
            winRate: userPredicted,
            allWinRates: allWinRates, // 存储所有人的胜率
            avgWinRate: avgPredicted,
            diff: winRateDiff,
            influence: 0,
            probA: 0,
            captureProb: 0, // 新增：吃子干预概率
            roll: 0
        };

        // ---------------------------------------------------------
        // 8. 干预终点到达 (End Game Intervention)
        // ---------------------------------------------------------
        // 仅对人类生效，保持最后冲刺的戏剧性，Bot 暂时不需要这种强干预
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
        // 现在对 Bot 也生效，让 Bot 也能在关键时刻吃子
        // if (isHumanTurn) { // 移除此限制
            // 传入计算好的胜率参数
            const captureRoll = this.checkCaptureIntervention(player, context, winRateDiff, baseBalanceValue);
            if (captureRoll !== null) {
                console.log("Trigger: Capture Intervention -> " + captureRoll);
                this.lastDebugInfo.trigger = 'Capture Intervention';
                this.lastDebugInfo.roll = captureRoll;
                return captureRoll;
            }
        // }

        // ---------------------------------------------------------
        // 4. 正常逻辑 (Sigmoid Probability)
        // ---------------------------------------------------------
        // 传入计算好的胜率参数
        let roll = this.rollDiceSigmoid(player, players, allWinRates, winRateDiff, baseBalanceValue);
        
        // ---------------------------------------------------------
        // 9. 防御性干预 (Anti-Capture Intervention)
        // ---------------------------------------------------------
        // 如果当前随机出的点数会导致“受保护玩家”被吃，尝试重掷
        if (this.checkAntiCaptureIntervention(player, roll, context)) {
            console.log("Trigger: Anti-Capture Intervention (Protecting Victim)");
            this.lastDebugInfo.trigger = 'Anti-Capture Intervention';
            // 尝试获取一个安全点数
            const safeRoll = this.getSafeRoll(player, context);
            if (safeRoll !== null) {
                roll = safeRoll;
            }
        }

        this.lastDebugInfo.roll = roll;
        return roll;
    }

    // 4. Sigmoid 骰子逻辑
    rollDiceSigmoid(player, players, preCalculatedRates, winRateDiff, baseBalanceValue) {
        // 如果参数未传入 (兼容旧调用)，则重新计算
        if (winRateDiff === undefined) {
             // ... (省略重新计算逻辑)
             // 略
        }

        // --- 加速机制：时间越长，平均点数越大 ---
        // 获取游戏时长 (需要 context，但这里参数列表没传 context，只能尝试从全局或 hack)
        // 更好的方式是修改调用处，但为了最小改动，我们假设 AIController 实例能访问到时间
        // 或者我们简单点，直接用 Date.now() 和一个假设的开始时间？
        // 不行，必须准确。
        // 我们在 rollDice 里已经有了 context.gameStartTime。
        // 但是 rollDiceSigmoid 参数里没有。
        // 让我们修改 rollDiceSigmoid 的签名不太好，因为它是内部方法。
        // 但我们可以把 context 挂在 this 上，或者直接在 rollDice 里处理。
        
        // 实际上，我们在 rollDice 里调用 rollDiceSigmoid。
        // 让我们在 rollDice 里计算好 "speedUpFactor" 传进来，或者直接在这里改。
        // 鉴于 JS 的灵活性，我们假设调用者会把 context 里的 gameStartTime 传给 this.lastContext (如果我存了的话)
        // 但我没存。
        
        // 简单方案：在 rollDiceSigmoid 增加一个参数，或者在 rollDice 里直接修改 probA 的逻辑
        // 让我们修改 rollDiceSigmoid 的逻辑，增加对 "Group A" 内部分布的控制
        
        // 基础影响参数
        let influenceParam = winRateDiff + baseBalanceValue + 1.6;
        
        // --- 动态调整：开局加速出兵 ---
        // 如果玩家在基地有棋子，且游戏时间 < 3分钟，稍微增加掷出 6 的概率
        // 我们无法直接获取时间，但可以通过 player.pieces 判断
        const piecesInBase = player.pieces.filter(p => p === -1).length;
        if (piecesInBase >= 3) {
            // 还有很多棋子没出来，降低 influenceParam (让 probA 变小，probB(6) 变大)
            influenceParam -= 0.5; 
        } else if (piecesInBase >= 2) {
            // 修正：如果玩家有 >= 2 个棋子在基地，大幅增加出 6 概率，防止卡死太久
            // 这是一个强力救援机制，避免玩家沮丧
            influenceParam -= 0.8;
        }

        this.lastDebugInfo.influence = influenceParam;
        
        // A 组合 (1-5) 概率
        const probA = Math.exp(influenceParam) / (1 + Math.exp(influenceParam));
        this.lastDebugInfo.probA = probA;
        
        // 随机选择组合
        const isGroupA = Math.random() < probA;

        if (isGroupA) {
            this.lastDebugInfo.trigger = 'Sigmoid Group A (1-5)';
            // --- 加速机制：Group A 内部加权 ---
            // 目标：偏向大数 (3,4,5)，但保留 1,2 的合理概率
            // 策略：80% 概率出 {3,4,5}，20% 概率出 {1,2}
            const isHighSubgroup = Math.random() < 0.8;
            
            if (isHighSubgroup) {
                // {3, 4, 5}
                const sub = [3, 4, 5];
                return sub[Utils.randomInt(0, 2)];
            } else {
                // {1, 2}
                const sub = [1, 2];
                return sub[Utils.randomInt(0, 1)];
            }
        } else {
            this.lastDebugInfo.trigger = 'Sigmoid Group B (6)';
            return 6;
        }
    }

    // 5-7. 打人干预逻辑
    checkCaptureIntervention(player, context, winRateDiff, baseBalanceValue) {
        // 动态计算触发概率
        // 逻辑：胜率越高 (influence 越大)，获得帮助的概率越低
        // 使用 Sigmoid 函数变体: P = Sigmoid(0.4 - influence)
        
        const influence = (winRateDiff || 0) + (baseBalanceValue || 0);
        const param = 0.4 - influence;
        let prob = 1 / (1 + Math.exp(-param));

        // --- 时长限制逻辑 (改为回合数控制) ---
        // 目标：限制游戏节奏
        // < 20 回合: 0.3 (发育期)
        // 20-40 回合: 0.3 -> 1.0 (过渡到激战)
        // 40-80 回合: 1.0 (激战期)
        // 80-120 回合: 1.0 -> 0.2 (过渡到收官)
        // > 120 回合: 0.2 (强制收官)
        
        const turnCount = context.turnCount || 0;
        
        let timeCoefficient = 1.0;
        
        if (turnCount < 20) {
            timeCoefficient = 0.3;
        } else if (turnCount < 40) {
            // 20-40: 0.3 -> 1.0
            const progress = (turnCount - 20) / 20;
            timeCoefficient = 0.3 + (0.7 * progress);
        } else if (turnCount < 80) {
            // 40-80: 1.0
            timeCoefficient = 1.0;
        } else if (turnCount < 120) {
            // 80-120: 1.0 -> 0.2
            const progress = (turnCount - 80) / 40;
            timeCoefficient = 1.0 - (0.8 * progress);
        } else {
            // > 120: 0.2
            timeCoefficient = 0.2;
        }
        
        prob = prob * timeCoefficient;
        // -------------------
        
        // 连续吃子衰减：每连续触发一次，概率减少 10%
        if (this.consecutiveCaptures > 0) {
            prob -= (0.1 * this.consecutiveCaptures);
            if (prob < 0) prob = 0;
        }

        this.lastDebugInfo.captureProb = prob;

        if (Math.random() > prob) {
            this.lastDebugInfo.interventionSkipped = true;
            return null;
        }

        const { players, board } = context;
        
        // 寻找可行的吃子点数
        for (let dice = 1; dice <= 6; dice++) {
            // ... (省略循环体)
            // 检查是否有棋子在路上
            for (let i = 0; i < 4; i++) {
                const pos = player.pieces[i];
                if (pos !== -1 && pos !== 999) {
                    if (player.isValidMove(i, dice)) {
                        const newPos = pos + dice;
                        const captures = board.checkCapture(players, player.color, i, newPos);
                        
                        if (captures && captures.length > 0) {
                            const capture = captures[0];
                            const victim = players.find(p => p.id === capture.victimPlayerId);
                            
                            const oldRate = this.calculatePredictedWinRate(victim);
                            
                            const originalPos = victim.pieces[capture.victimPieceIndex];
                            victim.pieces[capture.victimPieceIndex] = -1; 
                            const newRate = this.calculatePredictedWinRate(victim);
                            victim.pieces[capture.victimPieceIndex] = originalPos; 
                            
                            const diff = oldRate - newRate;
                            
                            if (diff < 0.3) {
                                // 成功触发干预
                                this.consecutiveCaptures++;
                                return dice;
                            }
                        }
                    }
                }
            }
        }
        return null;
    }

    // 9. 防御性干预检测
    checkAntiCaptureIntervention(player, currentRoll, context) {
        const { players, board, turnCount } = context;
        
        // 检查当前点数是否会导致吃子
        // 遍历该玩家所有棋子
        for (let i = 0; i < 4; i++) {
            const pos = player.pieces[i];
            if (pos !== -1 && pos !== 999) {
                if (player.isValidMove(i, currentRoll)) {
                    const newPos = pos + currentRoll;
                    const captures = board.checkCapture(players, player.color, i, newPos);
                    
                    if (captures && captures.length > 0) {
                        const capture = captures[0];
                        const victim = players.find(p => p.id === capture.victimPlayerId);
                        
                        // 计算受害者的胜率情况
                        const allWinRates = players.map(p => this.calculatePredictedWinRate(p));
                        const totalPredicted = allWinRates.reduce((a, b) => a + b, 0);
                        const avgPredicted = totalPredicted / players.length;
                        const victimWinRate = allWinRates[victim.id];
                        const victimDiff = victimWinRate - avgPredicted;
                        
                        // 1. 弱势保护：如果受害者处于劣势 (Diff < -0.05)，则触发保护机制
                        if (victimDiff < -0.05) {
                            return true; 
                        }

                        // 2. 终局加速保护：如果游戏进入后期 (Turn > 60)，且受害者即将获胜，且其历史表现不过分
                        // 目的：加快游戏结束，让领先者赶紧赢
                        if (turnCount > 60) {
                            // 检查受害者是否接近胜利 (例如有 >= 2 个棋子已完成，或者进度分很高)
                            // 这里简单判断：如果 victimDiff > 0 (处于优势) 且不是遥遥领先 (Diff < 0.4)
                            // 或者 finishedPieces >= 2
                            if (victim.finishedPieces >= 2 || (victimDiff > 0 && victimDiff < 0.4)) {
                                // 新增：检查最近胜率
                                // 如果受害者是人类且最近胜率过高 (> 60%)，则不予保护，让他凭实力赢
                                if (!victim.isBot) {
                                    const recentRate = UserAccount.getRecentWinRate();
                                    if (recentRate > 0.6) {
                                        return false;
                                    }
                                }
                                
                                console.log("Trigger: Endgame Protection (Letting Winner Win)");
                                return true;
                            }
                        }
                    }
                }
            }
        }
        return false;
    }

    // 获取安全点数 (尝试寻找一个不吃受保护玩家的点数)
    getSafeRoll(player, context) {
        const candidates = [1, 2, 3, 4, 5, 6];
        // 打乱数组
        Utils.shuffleArray(candidates);
        
        for (let roll of candidates) {
            if (!this.checkAntiCaptureIntervention(player, roll, context)) {
                return roll;
            }
        }
        // 如果所有点数都会导致吃受保护的人（极罕见），则只能返回 null (放弃干预)
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

    // 获取保底点数
    getFailsafeRoll(player) {
        // 优先 1: 直接到达终点的点数
        for (let i = 0; i < 4; i++) {
            const pos = player.pieces[i];
            if (pos !== -1 && pos !== 999) {
                const dist = 56 - pos;
                if (dist <= 6 && dist >= 1) {
                    return dist;
                }
            }
        }
        
        // 优先 2: 任何可以移动的点数 (打破僵局)
        const validRolls = [];
        for (let d = 1; d <= 6; d++) {
            if (player.canMove(d)) {
                validRolls.push(d);
            }
        }
        
        if (validRolls.length > 0) {
            // 随机返回一个可行的点数
            return validRolls[Utils.randomInt(0, validRolls.length - 1)];
        }
        
        return null;
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
            const captures = board.checkCapture(players, player.color, pieceIdx, newPos);
            if (captures && captures.length > 0) {
                score += 100 * captures.length; // 吃得越多分越高
            }

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