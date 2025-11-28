class UI {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.cellSize = 40; // 格子大小
        this.boardOffset = {x: 0, y: 0}; // 居中偏移
        
        this.diceEl = document.getElementById('dice');
        this.rollBtn = document.getElementById('roll-btn');
        this.logEl = document.getElementById('game-log');
        
        this.animatingPieces = []; // 存储正在动画的棋子 {player, pieceIdx, x, y}
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const container = this.canvas.parentElement;
        let size = 600;
        
        if (container) {
             // On mobile (column layout), height might be unconstrained, so rely on width.
             // On desktop (row layout), we want to fit within the container's height too.
             const w = container.clientWidth;
             const h = container.clientHeight;
             
             if (window.innerWidth <= 768) {
                 // Mobile: just use width, minus some padding
                 size = w;
             } else {
                 // Desktop: fit in the box
                 size = Math.min(w, h);
             }
             
             if (size === 0) size = 600; 
        }
        
        // 设置 Canvas 物理尺寸
        this.canvas.width = size;
        this.canvas.height = size;
        
        // 计算格子大小 (15x15)
        this.cellSize = size / 15;
        
        // 重新绘制
        this.drawBoard();
    }

    drawBoard() {
        const ctx = this.ctx;
        const cs = this.cellSize;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 清空画布
        ctx.clearRect(0, 0, w, h);
        
        // 绘制背景
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);

        // 绘制四个基地区域
        // Top Left: Red (1)
        this.drawBase(0, 0, '#e74c3c'); 
        // Top Right: Green (2)
        this.drawBase(9, 0, '#2ecc71'); 
        // Bottom Right: Yellow (3)
        this.drawBase(9, 9, '#f1c40f'); 
        // Bottom Left: Blue (0)
        this.drawBase(0, 9, '#3498db'); 

        // 绘制格子路径
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;

        // 绘制十字架网格
        // Vertical arm (6-9, 0-15)
        for(let x=6; x<=9; x++) {
            ctx.beginPath(); ctx.moveTo(x*cs, 0); ctx.lineTo(x*cs, 15*cs); ctx.stroke();
        }
        for(let y=0; y<=15; y++) {
            // Skip center box if needed, but drawing lines is fine
            if (y >= 6 && y <= 9) continue; // Center area handled separately or just draw over
            // Actually, let's just draw the grid lines for the arms
        }
        
        // Better approach: Draw the 3x6 rectangles for arms
        // Top Arm
        this.drawGrid(6, 0, 3, 6);
        // Bottom Arm
        this.drawGrid(6, 9, 3, 6);
        // Left Arm
        this.drawGrid(0, 6, 6, 3);
        // Right Arm
        this.drawGrid(9, 6, 6, 3);

        // Draw Colored Home Paths
        if (BOARD_COORDINATES && BOARD_COORDINATES.homes) {
            this.colorCells(BOARD_COORDINATES.homes[0], '#3498db'); // Blue
            this.colorCells(BOARD_COORDINATES.homes[1], '#e74c3c'); // Red
            this.colorCells(BOARD_COORDINATES.homes[2], '#2ecc71'); // Green
            this.colorCells(BOARD_COORDINATES.homes[3], '#f1c40f'); // Yellow
        }
        
        // Draw Start Cells
        // Blue Start: {x: 6, y: 13}
        this.colorCell(6, 13, '#3498db');
        // Red Start: {x: 1, y: 6}
        this.colorCell(1, 6, '#e74c3c');
        // Green Start: {x: 8, y: 1}
        this.colorCell(8, 1, '#2ecc71');
        // Yellow Start: {x: 13, y: 8}
        this.colorCell(13, 8, '#f1c40f');

        // Draw Safe Zones (Shadow/Star)
        // Indices: 0, 13, 26, 39 (Starts) + 8, 21, 34, 47 (Stars)
        const safeZoneIndices = [0, 13, 26, 39, 8, 21, 34, 47];
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        
        safeZoneIndices.forEach(idx => {
            const coord = BOARD_COORDINATES.global[idx];
            if (coord) {
                // Draw a star
                this.drawStar(coord.x * cs + cs/2, coord.y * cs + cs/2, cs * 0.3, 5, cs * 0.15);
            }
        });

        // Draw Center Triangles
        ctx.beginPath(); ctx.moveTo(6*cs, 6*cs); ctx.lineTo(9*cs, 6*cs); ctx.lineTo(7.5*cs, 7.5*cs); ctx.fillStyle = '#2ecc71'; ctx.fill(); // Top (Green)
        ctx.beginPath(); ctx.moveTo(9*cs, 6*cs); ctx.lineTo(9*cs, 9*cs); ctx.lineTo(7.5*cs, 7.5*cs); ctx.fillStyle = '#f1c40f'; ctx.fill(); // Right (Yellow)
        ctx.beginPath(); ctx.moveTo(9*cs, 9*cs); ctx.lineTo(6*cs, 9*cs); ctx.lineTo(7.5*cs, 7.5*cs); ctx.fillStyle = '#3498db'; ctx.fill(); // Bottom (Blue)
        ctx.beginPath(); ctx.moveTo(6*cs, 9*cs); ctx.lineTo(6*cs, 6*cs); ctx.lineTo(7.5*cs, 7.5*cs); ctx.fillStyle = '#e74c3c'; ctx.fill(); // Left (Red)
    }

    drawGrid(x, y, w, h) {
        const cs = this.cellSize;
        const ctx = this.ctx;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        
        for(let i=0; i<=w; i++) {
            ctx.beginPath(); ctx.moveTo((x+i)*cs, y*cs); ctx.lineTo((x+i)*cs, (y+h)*cs); ctx.stroke();
        }
        for(let j=0; j<=h; j++) {
            ctx.beginPath(); ctx.moveTo(x*cs, (y+j)*cs); ctx.lineTo((x+w)*cs, (y+j)*cs); ctx.stroke();
        }
    }

    drawBase(x, y, color) {
        const ctx = this.ctx;
        const cs = this.cellSize;
        
        ctx.fillStyle = color;
        ctx.fillRect(x*cs, y*cs, 6*cs, 6*cs);
        
        // White inner box
        ctx.fillStyle = '#fff';
        ctx.fillRect((x+1)*cs, (y+1)*cs, 4*cs, 4*cs);
        
        // 4 circles for pieces
        ctx.fillStyle = color;
        const r = cs * 0.3;
        this.fillCircle((x+1.5)*cs, (y+1.5)*cs, r);
        this.fillCircle((x+4.5)*cs, (y+1.5)*cs, r);
        this.fillCircle((x+1.5)*cs, (y+4.5)*cs, r);
        this.fillCircle((x+4.5)*cs, (y+4.5)*cs, r);
    }

    fillCircle(cx, cy, r) {
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, r, 0, Math.PI*2);
        this.ctx.fill();
    }

    drawStar(cx, cy, outerRadius, spikes, innerRadius) {
        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        let step = Math.PI / spikes;

        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            this.ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            this.ctx.lineTo(x, y);
            rot += step;
        }
        this.ctx.lineTo(cx, cy - outerRadius);
        this.ctx.closePath();
        this.ctx.fillStyle = 'rgba(0,0,0,0.2)'; // Shadow color
        this.ctx.fill();
        // Optional: stroke
        // this.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        // this.ctx.stroke();
    }

    colorCells(cells, color) {
        if(!cells) return;
        cells.forEach(c => this.colorCell(c.x, c.y, color));
    }

    colorCell(x, y, color) {
        const cs = this.cellSize;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x*cs, y*cs, cs, cs);
        this.ctx.strokeRect(x*cs, y*cs, cs, cs);
    }

    drawPieces(players, board) {
        const ctx = this.ctx;
        const cs = this.cellSize;
        
        const piecesToDraw = [];

        // 1. 收集所有需要绘制的棋子信息
        players.forEach(p => {
            if (!p.isActive) return;
            p.pieces.forEach((pos, idx) => {
                // 检查是否正在动画中
                const animating = this.animatingPieces.find(ap => ap.player.id === p.id && ap.pieceIdx === idx);
                if (animating) {
                    // 动画中的棋子直接绘制，不参与重叠计算
                    this.drawPiece3D(animating.x, animating.y, p.color);
                    return;
                }

                let x, y;
                if (pos === -1) {
                    // 在基地
                    const baseCoords = BOARD_COORDINATES.bases[p.color][idx];
                    x = baseCoords.x;
                    y = baseCoords.y;
                } else if (pos === 999) {
                    // 完成 - 放在各自颜色的终点三角形内
                    // drawPiece3D 会自动 +0.5 居中，所以这里给整数坐标
                    // Blue(0): Bottom (7, 8), Red(1): Left (6, 7), Green(2): Top (7, 6), Yellow(3): Right (8, 7)
                    if (p.color === 0) { x = 7; y = 8; }      // Blue (Bottom)
                    else if (p.color === 1) { x = 6; y = 7; } // Red (Left)
                    else if (p.color === 2) { x = 7; y = 6; } // Green (Top)
                    else if (p.color === 3) { x = 8; y = 7; } // Yellow (Right)
                    else { x = 7; y = 7; }
                } else {
                    // 在路径上
                    const globalPos = board.getGlobalPos(p.color, pos);
                    let coord;
                    if (globalPos >= 100) {
                        // Home stretch
                        const homeIdx = Math.floor((globalPos - 100) / 10);
                        const step = globalPos % 10;
                        coord = BOARD_COORDINATES.homes[homeIdx][step];
                    } else {
                        coord = BOARD_COORDINATES.global[globalPos];
                    }
                    
                    if (coord) {
                        x = coord.x;
                        y = coord.y;
                    } else {
                        return; // Error
                    }
                }

                piecesToDraw.push({ x, y, color: p.color, player: p, idx });
            });
        });

        // 2. 按位置分组
        const groups = {};
        piecesToDraw.forEach(p => {
            const key = `${p.x},${p.y}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });

        // 3. 绘制
        for (let key in groups) {
            const group = groups[key];
            const count = group.length;
            
            if (count === 1) {
                const p = group[0];
                this.drawPiece3D(p.x, p.y, p.color);
            } else {
                // 处理重叠：多个棋子时，缩小一点，并偏移
                const scale = count > 4 ? 0.6 : 0.75;
                const offsetStep = 0.25;
                
                const offsets = this.getGroupOffsets(count, offsetStep);
                
                group.forEach((p, i) => {
                    const off = offsets[i] || {x:0, y:0};
                    this.drawPiece3D(p.x + off.x, p.y + off.y, p.color, scale);
                });
            }
        }
    }

    getGroupOffsets(count, step) {
        if (count === 2) return [{x: -step/2, y: 0}, {x: step/2, y: 0}];
        if (count === 3) return [{x: 0, y: -step/2}, {x: -step/2, y: step/2}, {x: step/2, y: step/2}];
        if (count === 4) return [{x: -step/2, y: -step/2}, {x: step/2, y: -step/2}, {x: -step/2, y: step/2}, {x: step/2, y: step/2}];
        
        // 更多棋子，围成圈
        const res = [];
        for(let i=0; i<count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            res.push({
                x: Math.cos(angle) * step * 0.8,
                y: Math.sin(angle) * step * 0.8
            });
        }
        return res;
    }

    // 绘制 3D 风格的棋子 (竖着的角度)
    drawPiece3D(gridX, gridY, colorIdx, scale = 1) {
        const ctx = this.ctx;
        const cs = this.cellSize;
        
        // 计算中心点
        const cx = gridX * cs + cs/2;
        const cy = gridY * cs + cs/2;
        
        const colors = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f'];
        const baseColor = colors[colorIdx];
        
        // 尺寸参数
        const baseWidth = cs * 0.6 * scale;
        const baseHeight = cs * 0.2 * scale; // 椭圆高度
        const bodyHeight = cs * 0.5 * scale;
        const headRadius = cs * 0.2 * scale;
        
        // 垂直偏移，让棋子看起来站在格子上
        const offsetY = cs * 0.1 * scale; 
        const baseY = cy + offsetY;

        // 1. 阴影 (Shadow)
        ctx.beginPath();
        ctx.ellipse(cx, baseY + baseHeight/2, baseWidth/1.8, baseHeight/1.8, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // 2. 底座 (Base) - 椭圆
        ctx.beginPath();
        ctx.ellipse(cx, baseY, baseWidth/2, baseHeight/2, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.darkenColor(baseColor, 20); // 底座深一点
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 * scale;
        ctx.stroke();

        // 3. 身体 (Body) - 梯形/圆柱
        // 从底座中心向上延伸
        const bodyBottomY = baseY;
        const bodyTopY = baseY - bodyHeight;
        const bodyBottomW = baseWidth * 0.6;
        const bodyTopW = baseWidth * 0.3;

        ctx.beginPath();
        ctx.moveTo(cx - bodyBottomW/2, bodyBottomY);
        ctx.lineTo(cx + bodyBottomW/2, bodyBottomY);
        ctx.lineTo(cx + bodyTopW/2, bodyTopY);
        ctx.lineTo(cx - bodyTopW/2, bodyTopY);
        ctx.closePath();
        ctx.fillStyle = baseColor;
        ctx.fill();
        ctx.stroke();

        // 4. 头部 (Head) - 圆球
        ctx.beginPath();
        ctx.arc(cx, bodyTopY - headRadius/2, headRadius, 0, Math.PI * 2);
        
        // 头部高光效果 (简单的径向渐变)
        const grad = ctx.createRadialGradient(
            cx - headRadius*0.3, bodyTopY - headRadius/2 - headRadius*0.3, headRadius*0.1,
            cx, bodyTopY - headRadius/2, headRadius
        );
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.3, baseColor);
        grad.addColorStop(1, this.darkenColor(baseColor, 30));
        
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.stroke();
    }

    // 辅助：颜色变暗
    darkenColor(color, percent) {
        // 简单的 hex 变暗逻辑 (假设输入是 #RRGGBB)
        let num = parseInt(color.replace("#",""), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) - amt,
        B = (num >> 8 & 0x00FF) - amt,
        G = (num & 0x0000FF) - amt;
        return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
    }

    // 动画移动棋子
    // pathPoints: Array of {x, y} (Grid coordinates)
    animatePieceMove(player, pieceIdx, pathPoints, board, players, onComplete) {
        if (!pathPoints || pathPoints.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        // 将棋子加入动画列表
        const animObj = {
            player: player,
            pieceIdx: pieceIdx,
            x: pathPoints[0].x,
            y: pathPoints[0].y
        };
        this.animatingPieces.push(animObj);

        let currentPointIndex = 0;
        let startTime = null;
        
        // 动态调整速度：如果是退回动画 (path 很长且最后是 null)，速度加快
        const isReturnAnim = pathPoints[pathPoints.length - 1] === null;
        const durationPerStep = isReturnAnim ? 50 : 200; // 退回 50ms/步，正常 200ms/步

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            
            // 计算当前应该在第几段路
            // 简单的线性插值
            
            if (currentPointIndex >= pathPoints.length - 1) {
                // 动画结束
                this.animatingPieces = this.animatingPieces.filter(p => p !== animObj);
                this.drawBoard();
                this.drawPieces(players, board);
                if (onComplete) onComplete();
                return;
            }

            const startP = pathPoints[currentPointIndex];
            const endP = pathPoints[currentPointIndex + 1];
            
            // 如果 endP 是 null (回基地最后一步)，直接结束
            if (!endP) {
                 this.animatingPieces = this.animatingPieces.filter(p => p !== animObj);
                 this.drawBoard();
                 this.drawPieces(players, board);
                 if (onComplete) onComplete();
                 return;
            }

            // 进度 0-1
            let progress = elapsed / durationPerStep;
            
            if (progress >= 1) {
                //这一步走完了，进入下一步
                currentPointIndex++;
                startTime = timestamp; // 重置时间
                progress = 0;
                // 立即更新位置到整点，防止闪烁
                animObj.x = endP.x;
                animObj.y = endP.y;
            } else {
                // 插值计算当前位置
                animObj.x = startP.x + (endP.x - startP.x) * progress;
                animObj.y = startP.y + (endP.y - startP.y) * progress;
            }

            // 重绘
            this.drawBoard();
            this.drawPieces(players, board);
            
            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    updateDice(value) {
        this.diceEl.textContent = value;
        this.diceEl.classList.add('shake'); // 添加动画类 (需在 CSS 定义)
        setTimeout(() => this.diceEl.classList.remove('shake'), 500);
    }

    log(msg) {
        const p = document.createElement('p');
        p.textContent = `> ${msg}`;
        this.logEl.prepend(p);
    }

    updateUserInfo(balance, winRate, wins, total) {
        document.getElementById('user-balance').textContent = balance;
        document.getElementById('user-winrate').textContent = (winRate * 100).toFixed(1) + '%';
        document.getElementById('stats-wins').textContent = wins;
        document.getElementById('stats-total').textContent = total;
    }

    showGameOver(winnerName, prize) {
        const modal = document.getElementById('game-over-modal');
        document.getElementById('winner-message').textContent = `${winnerName} 获胜！`;
        document.getElementById('winner-prize').textContent = prize;
        modal.classList.remove('hidden');
    }

    hideGameOver() {
        document.getElementById('game-over-modal').classList.add('hidden');
    }

    updateDebugInfo(info) {
        const el = document.getElementById('debug-info');
        if (!el || !info) return;

        // 如果是初始状态，清空
        if (el.children.length > 0 && el.children[0].tagName === 'P') {
            el.innerHTML = '';
        }

        let html = '';
        const time = new Date().toLocaleTimeString();
        html += `[${time}] 玩家: ${info.player} (${info.isHuman ? '人类' : '电脑'})\n`;
        
        // 翻译触发原因
        let triggerCN = info.trigger;
        if (triggerCN === 'Normal') triggerCN = '正常随机';
        if (triggerCN === 'Bot Random') triggerCN = '电脑随机';
        if (triggerCN === 'EndGame Intervention') triggerCN = '终点干预';
        if (triggerCN === 'Capture Intervention') triggerCN = '吃子干预';
        if (triggerCN === 'Sigmoid Group A (1-5)') triggerCN = 'Sigmoid A组(1-5)';
        if (triggerCN === 'Sigmoid Group B (6)') triggerCN = 'Sigmoid B组(6)';

        html += `触发机制: ${triggerCN}\n`;
        html += `掷出点数: ${info.roll}\n`;
        
        html += `------------------\n`;
        html += `各玩家预测胜率:\n`;
        if (info.allWinRates) {
            info.allWinRates.forEach((rate, idx) => {
                const name = idx === 0 ? 'You' : `Bot ${idx}`;
                html += `  ${name}: ${(rate * 100).toFixed(1)}%\n`;
            });
        }

        // 无论是 Human 还是 Bot，都显示详细数据
        html += `------------------\n`;
        html += `当前玩家胜率: ${(info.winRate * 100).toFixed(1)}%\n`;
        html += `平均胜率: ${(info.avgWinRate * 100).toFixed(1)}%\n`;
        html += `胜率差值: ${info.diff.toFixed(3)}\n`;
        html += `影响因子: ${info.influence.toFixed(3)}\n`;
        html += `A组概率(1-5): ${(info.probA * 100).toFixed(1)}%\n`;
        if (info.captureProb) {
            html += `吃子干预概率: ${(info.captureProb * 100).toFixed(1)}%\n`;
        }
        
        // 创建新条目
        const entry = document.createElement('div');
        entry.style.borderBottom = '1px dashed #555';
        entry.style.paddingBottom = '5px';
        entry.style.marginBottom = '5px';
        entry.textContent = html;

        // 插入到最前面
        el.prepend(entry);
        
        // 限制条目数量，防止内存溢出 (例如保留最近 50 条)
        if (el.children.length > 50) {
            el.removeChild(el.lastChild);
        }
    }
}
