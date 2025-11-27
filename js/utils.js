const Utils = {
    // 基础随机数 [min, max]
    randomInt: (min, max) => {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    // 延迟函数
    sleep: (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    // 颜色常量
    COLORS: {
        BLUE: 0,   // 玩家
        RED: 1,    // Bot 1
        GREEN: 2,  // Bot 2
        YELLOW: 3  // Bot 3
    },

    COLOR_NAMES: ['Blue', 'Red', 'Green', 'Yellow'],
    
    // 坐标转换等辅助函数后续根据棋盘逻辑添加
};