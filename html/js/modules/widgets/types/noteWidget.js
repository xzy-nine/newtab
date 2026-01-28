/**
 * 便签小部件模块
 * 支持Markdown格式的便签功能
 * @author System
 * @version 1.0.0
 * @date 2026-01-28
 */

import { I18n, Utils } from '../../core/index.js';

/**
 * 获取marked渲染函数
 * @returns {Function|null} marked渲染函数
 */
function getMarkedFunction() {
  if (!window.marked) return null;
    // 尝试返回合适的解析函数或对象（兼容不同版本）
    return window.marked.marked || window.marked;
}

/**
 * 确保marked库加载完成
 * @returns {Promise<void>}
 */
function ensureMarkedLoaded() {
  return new Promise((resolve) => {
    if (getMarkedFunction()) {
      resolve();
    } else {
      // 加载marked.js库
      const script = document.createElement('script');
      script.src = 'js/libs/marked.min.js';
      script.async = false;
      script.onload = () => {
                // 为了确保换行被正确处理，尝试设置 breaks 选项（若库支持）
                try {
                    if (window.marked && typeof window.marked.setOptions === 'function') {
                        window.marked.setOptions({ breaks: true, gfm: true });
                    }
                } catch (e) {
                    console.warn('设置 marked 选项失败', e);
                }

                resolve();
      };
      script.onerror = () => {
        console.error('marked.js加载失败');
        resolve();
      };
      document.head.appendChild(script);
    }
  });
}

// 初始化marked库
ensureMarkedLoaded();

/**
 * 将 contentEditable 的 innerHTML 转换为以换行符为分隔的纯文本
 * @param {string} html
 * @returns {string}
 */
function htmlToPlainText(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    // 把 <br> 转为换行
    tmp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));

    // 对常见块级元素追加换行，保留文本结构
    const blockTags = ['div','p','li','h1','h2','h3','h4','h5','h6','pre','blockquote'];
    blockTags.forEach(tag => {
        tmp.querySelectorAll(tag).forEach(el => {
            // 在元素末尾添加换行符占位
            if (!el.__appendedNewline) {
                el.appendChild(document.createTextNode('\n'));
                el.__appendedNewline = true;
            }
        });
    });

    let text = tmp.textContent || '';
    // 统一换行符并清理多余空白
    text = text.replace(/\r\n/g, '\n').replace(/\u00A0/g, ' ');
    text = text.replace(/\n{3,}/g, '\n\n');
    // 移除结尾多余换行
    return text.replace(/\n+$/g, '');
}

/**
 * 将纯文本（以\n为换行）转换为可用于 contentEditable 的 html（用 <br> 表示换行）
 * @param {string} text
 * @returns {string}
 */
function plainTextToHtml(text) {
    if (!text) return '';
    const esc = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    return esc.replace(/\n/g, '<br>');
}

/**
 * 将光标移动到 contentEditable 元素末尾
 * @param {HTMLElement} el
 */
function setCaretToEnd(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

/**
 * 根据预览容器尺寸调整字体大小，尽量减少垂直滚动
 * @param {HTMLElement} previewEl
 * @param {{min:number,max:number,step:number}} options
 */
function adjustPreviewFont(previewEl, options = {}) {
    if (!previewEl) return;
    // 将最小字体调小，并使用更细的步长以便更精细适配
    const opts = Object.assign({ min: 1, max: 18, step: 0.25 }, options);
    // 获取基础字体大小（CSS中定义的默认值）
    const computed = window.getComputedStyle(previewEl);
    const base = parseFloat(computed.fontSize) || 14;

    // 重置为基础字体
    let size = Math.min(Math.max(base, opts.min), opts.max);
    previewEl.style.fontSize = size + 'px';

    // 如果内容超高，逐步减小字体直至合适或达到最小值
    // 使用循环防止无限循环，最大迭代次数限制
    let iter = 0;
    const maxIter = Math.ceil((size - opts.min) / opts.step) + 2;
    while (previewEl.scrollHeight > previewEl.clientHeight && iter < maxIter) {
        size = Math.max(opts.min, +(size - opts.step).toFixed(2));
        previewEl.style.fontSize = size + 'px';
        iter++;
        // 如果缩小后高度没有变化，跳出以避免长时间循环
        if (iter > 1 && previewEl.scrollHeight === previewEl.clientHeight) break;
    }
}

/**
 * 便签小部件
 * @namespace NoteWidget
 */
const NoteWidget = {
    /**
     * 小部件元数据
     */
    metadata: {
        name: I18n.getMessage('widgetNote', '便签'),
        description: I18n.getMessage('widgetNoteDesc', '支持Markdown格式的便签小部件'),
        icon: '\uE734'
    },
    
    /**
     * 小部件配置
     */
    config: {
        min: {
            width: 200,
            height: 150
        }
    },
    
    /**
     * 初始化小部件
     * @param {HTMLElement} container - 小部件容器元素
     * @param {Object} data - 小部件数据
     */
    initialize: function(container, data = {}) {
        // 清除容器内容
        container.innerHTML = '';
        
        // 创建便签容器
        const noteContainer = Utils.createElement('div', 'note-widget-container');
        // 直接设置内联样式确保从左上角开始并占据整个容器
        Object.assign(noteContainer.style, {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            textAlign: 'left',
            width: '100%',
            height: '100%',
            margin: '0',
            padding: '0'
        });
        
        // 创建Markdown编辑器（使用可编辑的div替代原生textarea）
        const editor = Utils.createElement('div', 'note-editor', {
            contentEditable: 'true',
            placeholder: I18n.getMessage('widgetNotePlaceholder', '输入Markdown格式的便签内容...')
        });
        // 使用 innerHTML 显示已保存的纯文本（将换行转换为 <br>）
        editor.innerHTML = plainTextToHtml(data.content || '');
        
        // 直接设置内联样式确保从左上角开始并占据整个空间
        Object.assign(editor.style, {
            width: '100%',
            height: '100%',
            flexGrow: '1',
            padding: '12px',
            border: 'none',
            fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
            fontSize: '14px',
            lineHeight: '1.4',
            backgroundColor: 'var(--widget-bg-solid)',
            color: 'var(--widget-text-color)',
            outline: 'none',
            borderRadius: '0',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            textAlign: 'left',
            verticalAlign: 'top',
            overflowY: 'auto',
            display: 'block',
            margin: '0'
        });
        
        // 创建预览容器
        const preview = Utils.createElement('div', 'note-preview');
        // 直接设置内联样式确保从左上角开始并占据整个空间
        Object.assign(preview.style, {
            width: '100%',
            height: '100%',
            flexGrow: '1',
            padding: '12px',
            fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
            fontSize: '14px',
            lineHeight: '1.4',
            backgroundColor: 'var(--widget-bg-solid)',
            color: 'var(--widget-text-color)',
            overflowY: 'auto',
            borderRadius: '0',
            textAlign: 'left',
            verticalAlign: 'top',
            display: 'block',
            margin: '0'
        });
        
        // 添加到容器
        noteContainer.appendChild(editor);
        noteContainer.appendChild(preview);
        container.appendChild(noteContainer);
        
        // 检测当前主题并设置相应的文本颜色
        const updateThemeColors = () => {
            const root = document.documentElement;
            const theme = root.getAttribute('data-theme') || 'light';
            const isDark = theme === 'dark';
            
            // 设置编辑器颜色
            editor.style.color = isDark ? '#ffffff' : '#333333';
            editor.style.backgroundColor = isDark ? '#1e1e1e' : '#f8f9fa';
            
            // 设置预览颜色
            preview.style.color = isDark ? '#ffffff' : '#333333';
            preview.style.backgroundColor = isDark ? '#1e1e1e' : '#f8f9fa';
            
            // 确保从左上角开始并占据整个容器
            Object.assign(noteContainer.style, {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'flex-start',
                textAlign: 'left',
                width: '100%',
                height: '100%',
                margin: '0',
                padding: '0'
            });
            
            // 确保编辑器和预览占据整个空间
            Object.assign(editor.style, {
                width: '100%',
                height: '100%',
                flexGrow: '1',
                margin: '0',
                borderRadius: '0'
            });
            
            Object.assign(preview.style, {
                width: '100%',
                height: '100%',
                flexGrow: '1',
                margin: '0',
                borderRadius: '0'
            });
        };
        
        // 初始更新
        updateThemeColors();
        
        // 监听主题变化
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'data-theme') {
                    updateThemeColors();
                    // 重新渲染预览以更新颜色
                    this.renderPreview(container.widgetData?.content || '', preview);
                    // 主题变化后重新调整字体
                    adjustPreviewFont(preview);
                }
            });
        });
        
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
        
        // 存储observer引用以便后续清理
        container._themeObserver = observer;
        
        // 初始化widgetData
        container.widgetData = {
            ...data
        };

        // 监听容器尺寸变化，调整预览字体以适配高度
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
                // 重置字体为 CSS 默认后重新调整
                preview.style.fontSize = '';
                adjustPreviewFont(preview);
            });
            ro.observe(noteContainer);
            container._resizeObserver = ro;
        }
        
        // 初始状态：显示预览
        editor.style.display = 'none';
        preview.style.display = 'block';
        this.renderPreview(data.content || '', preview);
        // 根据容器尺寸调整预览字体以尽量避免垂直滚动
        adjustPreviewFont(preview);
        
        // 编辑器内容变化时更新预览并保存数据（将 innerHTML 转回纯文本）
        editor.addEventListener('input', () => {
            const content = htmlToPlainText(editor.innerHTML || '');
            this.renderPreview(content, preview);
            // 实时调整字体以减少滚动
            adjustPreviewFont(preview);
            this.saveData(container, content);
        });
        
        // 点击容器时切换到编辑模式
        noteContainer.addEventListener('click', (e) => {
            // 如果点击的不是编辑器本身，也不是预览中的链接等可交互元素
            if (!editor.contains(e.target) && !e.target.closest('a') && !e.target.closest('button')) {
                // 将存储的纯文本转换为 HTML 并放入编辑器
                editor.innerHTML = plainTextToHtml(container.widgetData?.content || '');
                editor.style.display = 'block';
                preview.style.display = 'none';
                // 将光标移动到末尾
                setCaretToEnd(editor);
            }
        });
        
        // 编辑器失去焦点时保存内容并切换到预览模式
        editor.addEventListener('blur', () => {
            const content = htmlToPlainText(editor.innerHTML || '');
            this.saveData(container, content);
            this.renderPreview(content, preview);
            // 保存后调整字体
            adjustPreviewFont(preview);
            editor.style.display = 'none';
            preview.style.display = 'block';
        });
        
        // 存储数据引用 - 保持之前的设置不变
        // container.widgetData = data;
    },
    
    /**
     * 渲染Markdown预览
     * @param {string} content - Markdown内容
     * @param {HTMLElement} previewElement - 预览元素
     */
    renderPreview: function(content, previewElement) {
        if (!content) {
            previewElement.innerHTML = '<div class="note-empty">' + I18n.getMessage('widgetNoteEmpty', '无内容') + '</div>';
            return;
        }
        // 不改变原始内容，仅确保传入 marked 的为纯文本 markdown
        const processedContent = String(content);

        const markedFunction = getMarkedFunction();
        if (markedFunction) {
            try {
                let html = '';
                // 不同版本 marked 的 API 兼容处理
                if (typeof markedFunction === 'function') {
                    // old-style: marked(text, options)
                    html = markedFunction(processedContent, { breaks: true, gfm: true });
                } else if (markedFunction && typeof markedFunction.parse === 'function') {
                    // modern: marked.parse(text, options)
                    html = markedFunction.parse(processedContent, { breaks: true, gfm: true });
                } else if (markedFunction && typeof markedFunction.default === 'function') {
                    html = markedFunction.default(processedContent, { breaks: true, gfm: true });
                } else {
                    html = String(processedContent).replace(/\n/g, '<br>');
                }
                previewElement.innerHTML = html;
            } catch (error) {
                console.error('marked.js渲染失败:', error);
                // 降级：将换行替换为 <br>
                const html = processedContent.replace(/\n/g, '<br>');
                previewElement.innerHTML = '<div>' + html + '</div>';
            }
        } else {
            // 未加载 marked：简单替换换行为 <br>
            const html = processedContent.replace(/\n/g, '<br>');
            previewElement.innerHTML = '<div>' + html + '</div>';
        }
    },
    
    /**
     * 保存便签数据
     * @param {HTMLElement} container - 小部件容器元素
     * @param {string} content - 便签内容
     */
    saveData: function(container, content) {
        if (container) {
            container.widgetData = {
                ...container.widgetData,
                content: content
            };
            // 触发数据变更事件
            document.dispatchEvent(new CustomEvent('widget-data-changed'));
        }
    },
    
    /**
     * 获取小部件数据
     * @param {HTMLElement} container - 小部件容器元素
     * @returns {Object} 小部件数据
     */
    getData: function(container) {
        return container.widgetData || {};
    },
    
    /**
     * 销毁小部件
     * @param {HTMLElement} container - 小部件容器元素
     */
    destroy: function(container) {
        // 清理主题监听器
        if (container._themeObserver) {
            container._themeObserver.disconnect();
            container._themeObserver = null;
        }
        // 清理尺寸监听器
        if (container._resizeObserver) {
            container._resizeObserver.disconnect();
            container._resizeObserver = null;
        }
        
        // 清理事件监听器等资源
        const editor = container.querySelector('.note-editor');
        if (editor) {
            // 移除事件监听器
            const clone = editor.cloneNode(true);
            editor.parentNode.replaceChild(clone, editor);
        }
    }
};

export default NoteWidget;