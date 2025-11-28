class Player {
    constructor(id, color, isBot = false, name = 'Player') {
        this.id = id;
        this.color = color; // 0: Blue, 1: Red, 2: Green, 3: Yellow
        this.isBot = isBot;
        this.name = name;
        
        // 棋子状态: -1 表示在基地, 0-56 表示路径上的位置, 57+ 表示到达终点
        // 这里的路径位置是相对于玩家自己的起点的
        this.pieces = [-1, -1, -1, -1]; 
        
        this.finishedPieces = 0;
        this.isActive = true; // 是否参与本局游戏
    }

    reset() {
        this.pieces = [-1, -1, -1, -1];
        this.finishedPieces = 0;
    }

    // 检查是否有棋子可以移动
    canMove(diceValue) {
        for (let i = 0; i < 4; i++) {
            if (this.isValidMove(i, diceValue)) {
                return true;
            }
        }
        return false;
    }

    // 检查特定棋子是否可以移动
    isValidMove(pieceIndex, diceValue) {
        const pos = this.pieces[pieceIndex];

        // 1. 在基地，必须掷出 6 才能起飞
        if (pos === -1) {
            return diceValue === 6;
        }

        // 2. 已经到达终点
        if (pos === 999) { // 假设 999 是终点完成状态
            return false;
        }

        // 3. 在路径上，检查是否超出终点
        // 假设路径总长度为 56 (到达终点所需的步数)
        // 0 是起点, 56 是终点
        if (pos + diceValue <= 56) {
            return true;
        }

        return false;
    }

    movePiece(pieceIndex, diceValue) {
        if (!this.isValidMove(pieceIndex, diceValue)) return false;

        const currentPos = this.pieces[pieceIndex];

        if (currentPos === -1) {
            // 起飞，移动到起点 (0)
            this.pieces[pieceIndex] = 0;
        } else {
            this.pieces[pieceIndex] += diceValue;
        }

        // 检查是否到达终点
        if (this.pieces[pieceIndex] === 56) {
            this.finishedPieces++;
            this.pieces[pieceIndex] = 999; // 标记为完成
            return 'finished'; // 返回特殊状态
        }

        return 'moved';
    }
    
    // 获取所有可移动的棋子索引
    getMovablePieces(diceValue) {
        let movable = [];
        for(let i=0; i<4; i++) {
            if(this.isValidMove(i, diceValue)) {
                movable.push(i);
            }
        }
        return movable;
    }
}

// 玩家资金管理 (全局单例或静态管理)
const UserAccount = {
    balance: 500,
    wins: 0,
    totalGames: 0,
    history: [], // 存储最近 100 局结果: 1 赢, 0 输

    load() {
        const saved = localStorage.getItem('ludo_user_data');
        if (saved) {
            const data = JSON.parse(saved);
            this.balance = data.balance !== undefined ? data.balance : 500;
            this.wins = data.wins !== undefined ? data.wins : 0;
            this.totalGames = data.totalGames !== undefined ? data.totalGames : 0;
            
            // 自动修复异常数据 (如总局数小于胜场数)
            if (this.totalGames < this.wins) {
                this.totalGames = this.wins;
            }

            this.history = (data.history && data.history.length > 0) ? data.history : [];
        }
    },

    save() {
        localStorage.setItem('ludo_user_data', JSON.stringify({
            balance: this.balance,
            wins: this.wins,
            totalGames: this.totalGames,
            history: this.history
        }));
    },

    recordGame(isWin) {
        this.history.push(isWin ? 1 : 0);
        if (this.history.length > 100) {
            this.history.shift();
        }
        this.save();
    },

    getWinRate() {
        if (this.totalGames === 0) return 0;
        return (this.wins / this.totalGames);
    },

    getRecentWinRate() {
        // 使用拉普拉斯平滑 (Laplace Smoothing) 计算胜率
        // 相当于预置了 1 胜 1 负，初始胜率为 50%
        // 这样在数据量少时（如前几局），胜率不会剧烈波动（0% 或 100%），而是趋向于 50%
        const currentWins = this.history.reduce((a, b) => a + b, 0);
        const currentTotal = this.history.length;
        return (currentWins + 1) / (currentTotal + 2);
    }
};
