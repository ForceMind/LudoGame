class Game {
    constructor() {
        this.ui = new UI('ludo-board');
        this.board = new LudoBoard();
        this.ai = new AIController();
        
        this.players = [];
        this.currentPlayerIndex = 0;
        this.isGameActive = false;
        this.turnState = 'waiting'; // waiting, rolled, moving
        this.currentDiceValue = 0;

        this.init();
    }

    init() {
        UserAccount.load();
        this.updateUserStats();

        // 绑定事件
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('roll-btn').addEventListener('click', () => this.handleRollClick());
        document.getElementById('restart-btn').addEventListener('click', () => {
            this.ui.hideGameOver();
            // 重置 UI 状态
            document.querySelector('.control-panel').classList.remove('hidden');
            document.getElementById('dice-container').classList.add('hidden');
        });
        
        // 绑定 Canvas 点击事件 (用于玩家选择棋子)
        this.ui.canvas.addEventListener('click', (e) => this.handleBoardClick(e));

        // 尝试加载存档
        if (this.loadGame()) {
            this.ui.log('恢复未完成的游戏...');
            this.resumeGame();
        } else {
            // 初始绘制空棋盘
            this.ui.drawBoard();
        }
    }

    saveGame() {
        if (!this.isGameActive) {
            localStorage.removeItem('ludo_game_state');
            return;
        }

        const state = {
            players: this.players.map(p => ({
                id: p.id,
                color: p.color,
                isBot: p.isBot,
                name: p.name,
                pieces: p.pieces,
                finishedPieces: p.finishedPieces,
                isActive: p.isActive
            })),
            currentPlayerIndex: this.currentPlayerIndex,
            isGameActive: this.isGameActive,
            turnState: this.turnState,
            currentDiceValue: this.currentDiceValue,
            potSize: document.getElementById('pot-size').textContent
        };
        localStorage.setItem('ludo_game_state', JSON.stringify(state));
    }

    loadGame() {
        const saved = localStorage.getItem('ludo_game_state');
        if (!saved) return false;

        try {
            const state = JSON.parse(saved);
            if (!state.isGameActive) return false;

            this.players = state.players.map(data => {
                const p = new Player(data.id, data.color, data.isBot, data.name);
                p.pieces = data.pieces;
                p.finishedPieces = data.finishedPieces;
                p.isActive = data.isActive;
                return p;
            });

            this.currentPlayerIndex = state.currentPlayerIndex;
            this.isGameActive = state.isGameActive;
            this.turnState = state.turnState;
            this.currentDiceValue = state.currentDiceValue;
            
            document.getElementById('pot-size').textContent = state.potSize || '0';

            // 恢复 UI 状态
            document.querySelector('.control-panel').classList.add('hidden');
            document.getElementById('dice-container').classList.remove('hidden');
            
            // 恢复 Bot 面板
            const botCount = this.players.filter(p => p.isBot).length;
            for(let i=1; i<=3; i++) {
                const panel = document.getElementById(`bot-panel-${i}`);
                if (i <= botCount) {
                    panel.style.opacity = 1;
                    panel.querySelector('.bot-status').textContent = '游戏中';
                } else {
                    panel.style.opacity = 0.5;
                    panel.querySelector('.bot-status').textContent = '未激活';
                }
            }

            return true;
        } catch (e) {
            console.error('Failed to load game', e);
            return false;
        }
    }

    async resumeGame() {
        this.ui.drawBoard();
        this.ui.drawPieces(this.players, this.board);
        
        const player = this.players[this.currentPlayerIndex];
        this.ui.log(`轮到 ${player.name} (${Utils.COLOR_NAMES[player.color]})`);

        if (player.isBot) {
            // 如果是 Bot，重新开始它的回合逻辑
            this.startTurn();
        } else {
            // 人类玩家
            if (this.turnState === 'waiting_move') {
                // 已经掷骰子，等待移动
                this.ui.updateDice(this.currentDiceValue);
                document.getElementById('roll-btn').disabled = true;
                this.ui.log(`已掷出 ${this.currentDiceValue}，请移动`);
            } else {
                // 还没掷骰子
                this.turnState = 'waiting_roll';
                document.getElementById('roll-btn').disabled = false;
            }
        }
    }

    updateUserStats() {
        this.ui.updateUserInfo(
            UserAccount.balance,
            UserAccount.getWinRate(),
            UserAccount.wins,
            UserAccount.totalGames
        );
        // 传入 players 进行局内评估，如果游戏还没开始 players 为空或不完整也没关系
        this.ai.updateMode(UserAccount.getWinRate(), this.players);
    }

    startGame() {
        const botCount = parseInt(document.getElementById('bot-count').value);
        const entryFee = 100;

        if (UserAccount.balance < entryFee) {
            alert('余额不足！');
            return;
        }

        UserAccount.balance -= entryFee;
        UserAccount.save();
        this.updateUserStats();

        // 初始化玩家
        this.players = [];
        // 玩家总是 Blue (0)
        this.players.push(new Player(0, 0, false, 'You'));
        
        // 添加 Bots
        const colors = [1, 2, 3]; // Red, Green, Yellow
        for (let i = 0; i < 3; i++) {
            const isBot = i < botCount;
            // 即使不选满 3 个 Bot，为了棋盘完整性，我们通常还是会有 4 个位置，
            // 但这里为了简化，未激活的 Bot 就不参与循环
            if (isBot) {
                this.players.push(new Player(i+1, colors[i], true, `Bot ${i+1}`));
            }
        }

        // 更新奖池显示
        const prizePool = entryFee * (this.players.length);
        document.getElementById('pot-size').textContent = prizePool;

        // UI 切换
        document.querySelector('.control-panel').classList.add('hidden'); // 隐藏设置面板 (简单处理，实际可能只想禁用)
        document.getElementById('dice-container').classList.remove('hidden');
        
        // 更新 Bot 面板状态
        for(let i=1; i<=3; i++) {
            const panel = document.getElementById(`bot-panel-${i}`);
            if (i <= botCount) {
                panel.style.opacity = 1;
                panel.querySelector('.bot-status').textContent = '游戏中';
            } else {
                panel.style.opacity = 0.5;
                panel.querySelector('.bot-status').textContent = '未激活';
            }
        }

        this.isGameActive = true;
        this.currentPlayerIndex = 0;
        this.ui.log('游戏开始！');
        this.ui.drawBoard();
        this.ui.drawPieces(this.players, this.board);

        this.startTurn();
    }

    async startTurn() {
        if (!this.isGameActive) return;

        // 保存游戏状态
        this.saveGame();

        // 每回合开始前，更新 AI 模式 (实时监控局势)
        this.ai.updateMode(UserAccount.getWinRate(), this.players);

        const player = this.players[this.currentPlayerIndex];
        this.ui.log(`轮到 ${player.name} (${Utils.COLOR_NAMES[player.color]})`);
        
        // 高亮当前玩家 (简单处理：在日志显示)
        
        if (player.isBot) {
            document.getElementById('roll-btn').disabled = true;
            await Utils.sleep(1000);
            await this.performTurn(player);
        } else {
            document.getElementById('roll-btn').disabled = false;
            this.turnState = 'waiting_roll';
        }
    }

    async handleRollClick() {
        if (this.turnState !== 'waiting_roll') return;
        
        document.getElementById('roll-btn').disabled = true;
        const player = this.players[this.currentPlayerIndex];
        await this.performTurn(player);
    }

    async performTurn(player) {
        // 1. 掷骰子
        // 传入上下文供 AI 作弊
        const context = {
            players: this.players,
            currentPlayerId: this.currentPlayerIndex,
            board: this.board
        };
        
        const diceValue = this.ai.rollDice(!player.isBot, context);
        this.currentDiceValue = diceValue;
        
        // 掷骰子后保存 (防止人类玩家刷新重掷)
        this.saveGame();

        this.ui.updateDice(diceValue);
        this.ui.updateDebugInfo(this.ai.lastDebugInfo);
        this.ui.log(`${player.name} 掷出了 ${diceValue}`);
        
        await Utils.sleep(500);

        // 2. 检查是否有棋子可走
        const movablePieces = player.getMovablePieces(diceValue);

        if (movablePieces.length === 0) {
            this.ui.log('无棋可走');
            await Utils.sleep(1000);
            this.nextTurn();
            return;
        }

        // 3. 选择棋子
        let selectedPieceIndex = -1;

        if (player.isBot) {
            // AI 决策
            selectedPieceIndex = this.ai.decideMove(player, diceValue, this.board, this.players);
            await Utils.sleep(800);
        } else {
            // 玩家决策
            if (movablePieces.length === 1) {
                // 只有一种走法，自动走
                selectedPieceIndex = movablePieces[0];
            } else {
                // 等待玩家点击棋盘
                this.turnState = 'waiting_move';
                this.ui.log('请点击棋子移动');
                // 这里需要等待点击事件改变状态，所以我们返回，等待 handleBoardClick 触发后续
                return; 
            }
        }

        await this.executeMove(player, selectedPieceIndex, diceValue);
    }

    // 处理玩家点击棋盘
    async handleBoardClick(e) {
        if (this.turnState !== 'waiting_move') return;
        
        const rect = this.ui.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 简单的点击检测：遍历玩家所有可移动棋子的位置
        // 这是一个简化的碰撞检测，实际应该更精确
        const player = this.players[this.currentPlayerIndex];
        const movable = player.getMovablePieces(this.currentDiceValue);
        const cs = this.ui.cellSize;

        for (let idx of movable) {
            const pos = player.pieces[idx];
            let px, py;
            
            if (pos === -1) {
                const base = BOARD_COORDINATES.bases[player.color][idx];
                px = base.x; py = base.y;
            } else {
                const globalPos = this.board.getGlobalPos(player.color, pos);
                let coord;
                if (globalPos >= 100) {
                    const homeIdx = Math.floor((globalPos - 100) / 10);
                    const step = globalPos % 10;
                    coord = BOARD_COORDINATES.homes[homeIdx][step];
                } else {
                    coord = BOARD_COORDINATES.global[globalPos];
                }
                px = coord.x; py = coord.y;
            }

            // 检查点击是否在格子范围内
            if (x > px*cs && x < (px+1)*cs && y > py*cs && y < (py+1)*cs) {
                this.turnState = 'moving';
                await this.executeMove(player, idx, this.currentDiceValue);
                return;
            }
        }
    }

    async executeMove(player, pieceIndex, diceValue) {
        // 1. 计算移动路径 (动画用)
        const currentPos = player.pieces[pieceIndex];
        let targetPos;
        
        if (currentPos === -1) {
            targetPos = 0; // 起飞
        } else {
            targetPos = currentPos + diceValue;
            if (targetPos > 56) targetPos = 56; // 理论上 isValidMove 已经检查过了，这里保险
        }

        // 获取路径坐标
        const path = this.board.getStepPath(player.color, currentPos, targetPos);

        // 2. 播放移动动画
        await new Promise(resolve => {
            this.ui.animatePieceMove(player, pieceIndex, path, this.board, this.players, resolve);
        });

        // 3. 更新逻辑位置 (动画结束后)
        // 注意：movePiece 会直接修改 player.pieces，所以我们要在动画后调用
        // 或者，我们应该在动画前调用 movePiece，但在动画期间 UI 使用旧位置？
        // 为了简单，我们在动画结束后更新逻辑，这样动画期间逻辑位置还是旧的，
        // 但 UI.animatePieceMove 会覆盖绘制。
        
        // 实际上，movePiece 逻辑很简单，我们手动更新一下，或者调用 movePiece
        // 为了保持一致性，我们还是调用 movePiece，但要注意它返回的状态
        const moveResult = player.movePiece(pieceIndex, diceValue);
        
        // 4. 检查吃子
        const newPos = player.pieces[pieceIndex];
        let hasCaptured = false;
        let hasReachedHome = (newPos === 999); // 检查是否到达终点
        
        if (newPos !== 999) {
            const captures = this.board.checkCapture(this.players, player.color, pieceIndex, newPos);
            if (captures && captures.length > 0) {
                hasCaptured = true;
                
                const animations = [];

                for (let capture of captures) {
                    const victim = this.players.find(p => p.id === capture.victimPlayerId);
                    const victimPieceIdx = capture.victimPieceIndex;
                    const victimCurrentPos = victim.pieces[victimPieceIdx];

                    this.ui.log(`${player.name} 吃掉了 ${victim.name} 的棋子！`);

                    // 4.1 计算被吃棋子的退回路径
                    const returnPath = this.board.getReturnPath(victim.color, victimCurrentPos);
                    
                    // 4.2 收集动画 Promise
                    animations.push(new Promise(resolve => {
                        this.ui.animatePieceMove(victim, victimPieceIdx, returnPath, this.board, this.players, resolve);
                    }));
                }

                // 并行播放所有被吃动画
                await Promise.all(animations);

                // 4.3 更新所有被吃棋子逻辑位置
                for (let capture of captures) {
                    const victim = this.players.find(p => p.id === capture.victimPlayerId);
                    victim.pieces[capture.victimPieceIndex] = -1; // 回基地
                }
            }
        }

        this.ui.drawBoard();
        this.ui.drawPieces(this.players, this.board);
        
        // 移动完成后保存
        this.saveGame();

        // 检查胜利条件
        if (player.finishedPieces === 4) {
            this.handleWin(player);
            return;
        }

        // 规则：掷出 6 或吃子 或 到达终点 奖励一回合
        if (diceValue === 6 || hasCaptured || hasReachedHome) {
            if (hasReachedHome) {
                this.ui.log('到达终点，奖励一回合！');
            } else if (hasCaptured) {
                this.ui.log('吃子奖励，再掷一次！');
            } else {
                this.ui.log('掷出 6，奖励一回合！');
            }
            await Utils.sleep(1000);
            this.startTurn(); // 重新开始该玩家回合
        } else {
            this.nextTurn();
        }
    }

    nextTurn() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.startTurn();
    }

    handleWin(winner) {
        this.isGameActive = false;
        this.saveGame(); // 清除存档 (因为 isGameActive 为 false)

        const prize = 100 * this.players.length;
        
        if (!winner.isBot) {
            UserAccount.balance += prize;
            UserAccount.wins++;
            UserAccount.recordGame(true); // 记录胜利
            this.ui.log('恭喜你赢了！');
        } else {
            UserAccount.recordGame(false); // 记录失败
            this.ui.log(`${winner.name} 赢了。`);
        }
        
        UserAccount.totalGames++;
        // UserAccount.save(); // recordGame 内部已经 save 了
        this.updateUserStats();
        
        this.ui.showGameOver(winner.name, winner.isBot ? 0 : prize);
    }
}

// 启动游戏
window.onload = () => {
    const game = new Game();
};
