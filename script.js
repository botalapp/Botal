class SpeechRecognizer {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isPressing = false;
        
        // 阿里云ASR配置
        this.config = {
            appkey: 'cFN6egU9mqIrijcV',
            accessToken: 'be0c529d53b94aed9803edc01dedf16c',
            apiUrl: 'https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr',
            sampleRate: 16000,
            format: 'pcm'
        };
        
        this.initializeElements();
        this.bindEvents();
    }
    
    initializeElements() {
        this.voiceBtn = document.getElementById('voiceBtn');
        this.recordingOverlay = document.getElementById('recordingOverlay');
        this.chatContainer = document.getElementById('chatContainer');
        this.voiceText = this.voiceBtn.querySelector('.voice-text');
    }
    
    bindEvents() {
        // 点击事件 - 新的录音模式
        this.voiceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleRecording();
        });
        
        // 移除之前的鼠标按下/松开和触摸事件
        // 这些事件不再需要，因为我们改为点击切换模式
    }
    
    toggleRecording() {
        if (!this.isRecording) {
            // 开始录音
            this.voiceText.textContent = '点击 停止';
            this.voiceBtn.style.background = '#FF3B30';
            this.startRecording();
        } else {
            // 停止录音
            this.voiceText.textContent = '点击 说话';
            this.voiceBtn.style.background = '#07C160';
            this.stopRecording();
        }
    }
    
    async startRecording() {
        try {
            this.recordingOverlay.style.display = 'flex';
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: this.config.sampleRate,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                } 
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=pcm'
            });
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => this.processRecording();
            
            this.mediaRecorder.start();
            this.isRecording = true;
            
        } catch (error) {
            console.error('录音启动失败:', error);
            this.recordingOverlay.style.display = 'none';
            this.addMessage('录音启动失败: ' + error.message, 'error');
            this.stopPressing();
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
            this.recordingOverlay.style.display = 'none';
        }
    }
    
    async processRecording() {
        try {
            // 立即显示加载中的消息
            const loadingMessageId = this.addLoadingMessage();
            
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            const audioBuffer = await audioBlob.arrayBuffer();
            
            // 将WebM格式转换为PCM格式
            const pcmData = await this.convertToPCM(audioBuffer);
            
            const result = await this.sendToASR(pcmData);
            
            // 更新消息内容
            if (result.status === 20000000) {
                const finalText = result.processed_result || result.result || '未识别到语音内容';
                this.updateMessageContent(loadingMessageId, finalText);
            } else {
                this.updateMessageContent(loadingMessageId, `识别失败: ${result.message}`, true);
            }
            
        } catch (error) {
            console.error('处理录音失败:', error);
            this.updateMessageContent(loadingMessageId, '处理失败: ' + error.message, true);
        }
    }
    
    addMessage(text, type = 'other') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.dataset.messageType = 'text';
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.textContent = text;
        
        // 添加长按编辑功能
        this.addLongPressEdit(messageDiv, bubbleDiv, text);
        
        messageDiv.appendChild(bubbleDiv);
        this.chatContainer.appendChild(messageDiv);
        
        // 滚动到底部
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        
        return messageDiv; // 返回消息元素以便后续更新
    }
    
    addLoadingMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message self';
        messageDiv.dataset.messageId = Date.now(); // 用于后续识别
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble loading';
        bubbleDiv.innerHTML = `
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span>正在识别语音...</span>
        `;
        
        messageDiv.appendChild(bubbleDiv);
        this.chatContainer.appendChild(messageDiv);
        
        // 滚动到底部
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        
        return messageDiv.dataset.messageId;
    }
    
    updateMessageContent(messageId, newText, isError = false) {
        const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageDiv) {
            const bubbleDiv = messageDiv.querySelector('.message-bubble');
            if (isError) {
                messageDiv.classList.add('error');
                bubbleDiv.style.background = '#FF3B30';
            }
            bubbleDiv.innerHTML = newText; // 替换内容
            
            // 为更新后的消息重新添加长按编辑功能
            if (!isError) {
                this.addLongPressEdit(messageDiv, bubbleDiv, newText);
            }
        }
    }

    addLongPressEdit(messageDiv, bubbleDiv, originalText) {
        let pressTimer;
        let isLongPress = false;
        let actionMenu = null;

        const startPress = (e) => {
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                this.showActionMenu(messageDiv, bubbleDiv, e);
            }, 800); // 800ms长按触发
        };

        const endPress = () => {
            clearTimeout(pressTimer);
        };

        const cancelPress = () => {
            clearTimeout(pressTimer);
            if (actionMenu) {
                this.hideActionMenu();
            }
        };

        const hideActionMenu = () => {
            if (actionMenu && actionMenu.parentNode) {
                actionMenu.parentNode.removeChild(actionMenu);
                actionMenu = null;
            }
        };

        // 添加触摸和鼠标事件
        bubbleDiv.addEventListener('touchstart', startPress, { passive: true });
        bubbleDiv.addEventListener('touchend', (e) => {
            endPress();
            setTimeout(hideActionMenu, 100);
        });
        bubbleDiv.addEventListener('touchmove', cancelPress);
        bubbleDiv.addEventListener('mousedown', startPress);
        bubbleDiv.addEventListener('mouseup', endPress);
        bubbleDiv.addEventListener('mouseleave', cancelPress);

        // 点击其他地方关闭菜单
        document.addEventListener('click', (e) => {
            if (!actionMenu || !actionMenu.contains(e.target)) {
                hideActionMenu();
            }
        });

        // 防止点击事件触发
        bubbleDiv.addEventListener('click', (e) => {
            if (isLongPress) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
    }

    showActionMenu(messageDiv, bubbleDiv, event) {
        // 隐藏其他菜单
        document.querySelectorAll('.action-menu').forEach(menu => menu.remove());

        // 创建操作菜单
        const menu = document.createElement('div');
        menu.className = 'action-menu';
        menu.innerHTML = `
            <button class="action-btn edit-btn" data-action="edit">
                <i data-feather="edit-3" class="action-icon"></i>
                编辑
            </button>
        `;

        // 添加样式
        menu.style.cssText = `
            position: absolute;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            padding: 8px 0;
            min-width: 100px;
            z-index: 1000;
            border: 1px solid #e0e0e0;
        `;

        const btn = menu.querySelector('.action-btn');
        btn.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            padding: 10px 15px;
            border: none;
            background: none;
            cursor: pointer;
            font-size: 14px;
            color: #333;
            transition: background 0.2s;
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#f5f5f5';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'none';
        });

        // 定位菜单
        const rect = bubbleDiv.getBoundingClientRect();
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom + 5}px`;

        // 添加点击事件
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startInlineEdit(messageDiv, bubbleDiv);
            menu.remove();
        });

        document.body.appendChild(menu);
        
        // 初始化Feather图标
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    startInlineEdit(messageDiv, bubbleDiv) {
        const originalText = bubbleDiv.textContent;
        
        // 创建编辑容器
        const editContainer = document.createElement('div');
        editContainer.className = 'inline-edit-container';
        editContainer.innerHTML = `
            <textarea class="inline-edit-textarea">${originalText}</textarea>
            <div class="inline-edit-actions">
                <button class="inline-edit-cancel">取消</button>
                <button class="inline-edit-save">保存</button>
            </div>
        `;

        // 保存原始样式和内容
        const originalStyle = window.getComputedStyle(bubbleDiv);
        const originalBackground = originalStyle.background;
        const originalPadding = originalStyle.padding;
        
        // 设置编辑容器样式
        editContainer.style.cssText = `
            width: 100%;
            background: ${originalBackground};
            border-radius: ${originalStyle.borderRadius};
            padding: ${originalPadding};
        `;

        const textarea = editContainer.querySelector('.inline-edit-textarea');
        textarea.style.cssText = `
            width: 100%;
            min-height: 60px;
            padding: 8px;
            border: 1px solid #07C160;
            border-radius: 8px;
            font-size: 14px;
            font-family: inherit;
            resize: vertical;
            background: white;
            outline: none;
            margin-bottom: 10px;
        `;

        const actions = editContainer.querySelector('.inline-edit-actions');
        actions.style.cssText = `
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        `;

        const buttonStyle = `
            padding: 6px 12px;
            border: none;
            border-radius: 15px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
        `;

        const cancelBtn = editContainer.querySelector('.inline-edit-cancel');
        cancelBtn.style.cssText = buttonStyle + `
            background: #f0f0f0;
            color: #666;
        `;

        const saveBtn = editContainer.querySelector('.inline-edit-save');
        saveBtn.style.cssText = buttonStyle + `
            background: #07C160;
            color: white;
        `;

        // 替换气泡内容为编辑容器
        bubbleDiv.style.display = 'none';
        messageDiv.insertBefore(editContainer, bubbleDiv);

        // 聚焦文本框
        textarea.focus();
        textarea.select();

        // 添加事件监听
        const finishEdit = () => {
            if (editContainer.parentNode) {
                messageDiv.removeChild(editContainer);
                bubbleDiv.style.display = 'block';
            }
        };

        cancelBtn.addEventListener('click', finishEdit);

        saveBtn.addEventListener('click', () => {
            const newText = textarea.value.trim();
            if (newText) {
                bubbleDiv.textContent = newText;
                // 重新添加长按编辑功能
                this.addLongPressEdit(messageDiv, bubbleDiv, newText);
            }
            finishEdit();
        });

        // 按ESC取消编辑
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                finishEdit();
            }
        });

        // 点击外部取消编辑
        const clickOutsideHandler = (e) => {
            if (!editContainer.contains(e.target)) {
                finishEdit();
                document.removeEventListener('click', clickOutsideHandler);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', clickOutsideHandler);
        }, 0);
    }
    
    async convertToPCM(audioBuffer) {
        // 创建音频上下文
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: this.config.sampleRate
        });
        
        // 解码音频数据
        const audioData = await audioContext.decodeAudioData(audioBuffer);
        
        // 获取单声道数据
        const channelData = audioData.getChannelData(0);
        
        // 将Float32转换为Int16
        const pcmData = new Int16Array(channelData.length);
        for (let i = 0; i < channelData.length; i++) {
            const s = Math.max(-1, Math.min(1, channelData[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        audioContext.close();
        return pcmData;
    }
    
    async sendToASR(audioData) {
        const response = await fetch('/api/asr', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream'
            },
            body: audioData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    if (typeof feather !== 'undefined') feather.replace();
    new SpeechRecognizer();
});