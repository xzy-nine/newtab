/**
 * 菜单系统模块
 * 包含上下文菜单、模态框、表单模态框等功能，适配响应式与国际化。
 * 依赖 Utils 和 I18n。
 * @module Menu
 */
import { Utils } from './utils.js';
import { I18n } from './i18n.js';

/**
 * Menu 命名空间，提供菜单、模态框、上下文菜单等功能。
 * @namespace Menu
 */
export const Menu = {
  /**
   * 显示表单模态框
   * @param {string} title - 模态框标题
   * @param {Array} formItems - 表单项配置数组
   * @param {Function} onConfirm - 确认回调函数
   * @param {string} confirmText - 确认按钮文本
   * @param {string} cancelText - 取消按钮文本
   * @param {Object} options - 额外选项 {gridSnap, draggable}
   * @returns {Object} 模态框控制对象 {close, enableGridSnap, disableGridSnap, ...}
   */
  showFormModal: (title, formItems, onConfirm, confirmText, cancelText, options = {}) => {
    const modalId = 'form-modal-' + Date.now();
    const modal = Utils.createElement('div', 'modal', { id: modalId });
    
    // 如果启用网格功能，添加相应类名
    if (options.gridSnap !== false && window.GridSystem && window.GridSystem.gridEnabled) {
      modal.classList.add('modal-grid-enabled');
    }
    
    const modalContent = Utils.createElement('div', 'modal-content', {}, 
      `<span class="modal-close">&times;</span><h2 class="modal-header">${title}</h2>`);
    
    const formContainer = Utils.createElement('div', 'modal-form');
      formItems.forEach(item => {
      // 判断是否为checkbox
      const groupClass = item.type === 'checkbox' ? 'form-group checkbox-group' : 'form-group';
      const formGroup = Utils.createElement('div', groupClass);

      // 如果是自定义类型，使用自定义的渲染函数
      if (item.type === 'custom' && typeof item.render === 'function') {
        const customLabel = Utils.createElement('label', '', {}, item.label);
        formGroup.appendChild(customLabel);
        
        // 使用渲染函数创建自定义内容
        item.render(formGroup);
        
        if (item.description) {
          const desc = Utils.createElement('div', 'setting-description', {}, item.description);
          formGroup.appendChild(desc);
        }
        
        formContainer.appendChild(formGroup);
        return; // 跳过后续处理
      }

      const label = Utils.createElement('label', '', { for: item.id }, item.label);
      
      let input;
      if (item.type === 'textarea') {
        input = Utils.createElement('textarea', '', { id: item.id });
      } else if (item.type === 'checkbox') {
        input = Utils.createElement('input', '', {
          id: item.id,
          type: 'checkbox'
        });
      } else if (item.type === 'select') {
        // 处理下拉选择框
        input = Utils.createElement('select', '', { id: item.id });
        
        // 添加选项
        if (Array.isArray(item.options)) {
          item.options.forEach(option => {
            const optionElement = Utils.createElement('option', '', 
              { value: option.value }, 
              option.text || option.label || option.value);
            input.appendChild(optionElement);
          });
          
          // 设置默认值
          if (item.value !== undefined) {
            input.value = item.value;
          }
        }
      } else {
        input = Utils.createElement('input', '', {
          id: item.id,
          type: item.type || 'text'
        });
        
        // 为range类型添加特殊处理
        if (item.type === 'range') {
          if (item.min !== undefined) input.min = item.min;
          if (item.max !== undefined) input.max = item.max;
          if (item.step !== undefined) input.step = item.step;
          
          // 如果启用了showValue，添加值显示
          if (item.showValue) {
            // 将valueDisplay存储在input元素上，供后续使用
            input._valueDisplay = Utils.createElement('span', 'range-value-display', {
              id: item.id + '-display'
            });
            
            // 更新显示函数
            const updateDisplay = () => {
              const value = parseFloat(input.value);
              if (!isNaN(value)) {
                input._valueDisplay.textContent = value.toFixed(1) + (item.unit || '');
              }
            };
            
            // 将updateDisplay函数也存储在input元素上，供外部调用
            input._updateDisplay = updateDisplay;
            
            // 初始化显示
            input.addEventListener('input', updateDisplay);
            input.addEventListener('change', updateDisplay);
            
            // 设置初始值（如果提供）
            if (item.value !== undefined) {
              input.value = item.value;
              updateDisplay();
            }
          }
        }
      }

      if (item.placeholder) input.placeholder = item.placeholder;
      if (item.required) input.required = true;
      if (item.value !== undefined) {
        if (item.type === 'checkbox') {
          input.checked = !!item.value;
        } else if (item.type !== 'select' && item.type !== 'range') { // 选择框和range已在上面处理
          input.value = item.value;
        }
      }
      if (item.disabled) input.disabled = true;

      // 添加onchange事件处理器
      if (typeof item.onchange === 'function') {
        input.addEventListener('change', item.onchange);
        input.addEventListener('input', item.onchange);
      }

      // 如果有描述，添加描述
      if (item.description) {
        const desc = Utils.createElement('div', 'setting-description', {}, item.description);
        formGroup.appendChild(desc);
      }

      // 复选框放在label前面
      if (item.type === 'checkbox') {
        formGroup.append(input, label);
      } else if (item.type === 'range' && item.showValue && input._valueDisplay) {
        // range类型且需要显示值时，添加值显示元素
        const inputContainer = Utils.createElement('div', 'range-input-container');
        inputContainer.append(input, input._valueDisplay);
        formGroup.append(label, inputContainer);
      } else {
        formGroup.append(label, input);
      }
      formContainer.appendChild(formGroup);
    });
    
    const actionDiv = Utils.createElement('div', 'form-actions');

    const cancelButton = Utils.createElement(
      'button', 
      'btn', 
      { id: `${modalId}-cancel` },
      cancelText || I18n.getMessage('cancel', '取消')
    );

    const confirmButton = Utils.createElement(
      'button', 
      'btn btn-primary', 
      { id: `${modalId}-confirm` },
      confirmText || I18n.getMessage('confirm', '确认')
    );
    
    actionDiv.append(cancelButton, confirmButton);
    formContainer.appendChild(actionDiv);
    modalContent.appendChild(formContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    modal.style.display = 'block';
      // 添加拖动功能
    Menu._makeModalDraggable(modal, modalContent, options);
    
    // 将模态框居中显示
    Menu._centerModal(modal, modalContent);
    
    const close = () => {
      modal.style.display = 'none';
      Menu._hideGridHint(); // 隐藏网格提示
      setTimeout(() => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
      }, 300);
    };
    
    // 创建控制对象
    const modalControls = {
      close,
      
      // 启用网格吸附
      enableGridSnap: () => {
        if (modalContent._dragState) {
          modalContent._dragState.setGridSnap(true);
          modal.classList.add('modal-grid-enabled');
        }
      },
      
      // 禁用网格吸附
      disableGridSnap: () => {
        if (modalContent._dragState) {
          modalContent._dragState.setGridSnap(false);
          modal.classList.remove('modal-grid-enabled');
        }
      },
      
      // 手动吸附到网格
      snapToGrid: () => {
        if (window.GridSystem && window.GridSystem.gridEnabled) {
          const currentLeft = parseInt(modalContent.style.left) || 0;
          const currentTop = parseInt(modalContent.style.top) || 0;
          const snappedPos = Menu._snapToGrid(
            currentLeft, 
            currentTop, 
            modalContent.offsetWidth, 
            modalContent.offsetHeight
          );
          
          modalContent.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
          modalContent.style.left = `${snappedPos.x}px`;
          modalContent.style.top = `${snappedPos.y}px`;
          
          setTimeout(() => {
            modalContent.style.transition = '';
          }, 300);
        }
      },
      
      // 获取当前位置
      getPosition: () => ({
        left: parseInt(modalContent.style.left) || 0,
        top: parseInt(modalContent.style.top) || 0,
        width: modalContent.offsetWidth,
        height: modalContent.offsetHeight
      }),
      
      // 设置位置
      setPosition: (left, top, animate = false) => {
        if (animate) {
          modalContent.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
          setTimeout(() => {
            modalContent.style.transition = '';
          }, 300);
        }
        modalContent.style.left = `${left}px`;
        modalContent.style.top = `${top}px`;
        Menu._keepModalInViewport(modalContent);
      }
    };
    
    confirmButton.addEventListener('click', () => {
      const formData = {};
      let allFilled = true;
        formItems.forEach(item => {
        // 跳过自定义渲染的表单项，因为它们应该已经有自己的处理逻辑
        if (item.type === 'custom') {
          // 自定义组件可能有自己的数据收集方法
          if (typeof item.getValue === 'function') {
            formData[item.id] = item.getValue();
          }
          return;
        }
        
        const input = document.getElementById(item.id);
        if (input) {
          // 根据不同类型处理表单值
          if (item.type === 'checkbox') {
            formData[item.id] = input.checked;  // 使用checked属性而不是value
          } else if (item.type === 'select') {
            formData[item.id] = input.value; // 选择框不需要trim
          } else {
            formData[item.id] = input.value.trim();
          }
          
          // 验证必填项
          if (item.required) {
            if (item.type === 'checkbox') {
              // 复选框特殊处理，因为false也是有效值
              if (item.requiredValue !== undefined && input.checked !== item.requiredValue) {
                allFilled = false;
                input.classList.add('error');
              }
            } else {
              // 文本、选择框等其他类型
              if ((typeof formData[item.id] === 'string' && !formData[item.id]) || 
                  formData[item.id] === undefined) {
                allFilled = false;
                input.classList.add('error');
              }
            }
          }
        }
      });
      
      if (!allFilled) {
        let errorMessage = document.getElementById(`${modalId}-error`);
        if (!errorMessage) {
          errorMessage = Utils.createElement('div', 'form-error', { id: `${modalId}-error` }, 
            I18n.getMessage('fillRequiredFields', '请填写所有必填字段'));
          formContainer.insertBefore(errorMessage, actionDiv);
        }
        return;
      }
      
      onConfirm(formData);
      close();
    });
    
    cancelButton.addEventListener('click', close);
      modal.querySelector('.modal-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    
    return modalControls;
  },
  /**
   * 模态框相关功能
   * @namespace Menu.Modal
   */
  Modal: {
    /**
     * 初始化所有模态框事件
     */
    initEvents: () => {
      document.querySelectorAll('.modal').forEach(modal => {
        modal.querySelectorAll('.modal-close').forEach(button => {
          Utils.replaceEventHandler('.modal-close', 'click', () => {
            modal.classList.remove('visible');
          });
        });
        
        modal.addEventListener('click', e => {
          if (e.target === modal) {
            modal.classList.remove('visible');
          }
        });
          // 为已有的模态框添加拖动功能
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
          Menu._makeModalDraggable(modal, modalContent, { gridSnap: true });
        }
      });
    },
    /**
     * 显示指定模态框
     * @param {string} modalId - 模态框ID
     */
    show: modalId => {
      const modal = document.getElementById(modalId);
      if (!modal) {
        console.error(`Modal with id ${modalId} not found`);
        return;
      }
      
      modal.classList.add('visible');
      
      if (!modal.dataset.initialized) {
        Utils.replaceEventHandler(`#${modalId} .modal-close`, 'click', () => {
          modal.classList.remove('visible');
        });
        
        modal.addEventListener('click', e => {
          if (e.target === modal) {
            modal.classList.remove('visible');
          }
        });
        
        // 添加拖动功能
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
          Menu._makeModalDraggable(modal, modalContent);
          
          // 初始化时居中显示
          Menu._centerModal(modal, modalContent);
        }
        
        modal.dataset.initialized = 'true';
      } else {
        // 已初始化的模态框再次显示时居中
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
          Menu._centerModal(modal, modalContent);
        }
      }
    },
    /**
     * 隐藏指定模态框
     * @param {string} modalId - 模态框ID
     */
    hide: modalId => {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('visible');
    }
  },
  /**
   * 上下文菜单功能
   * @namespace Menu.ContextMenu
   */
  ContextMenu: {
    /**
     * 初始化上下文菜单功能
     */
    init: function() {
      // 通用关闭菜单事件
      document.addEventListener('click', () => {
        document.querySelectorAll('.context-menu.visible').forEach(menu => {
          menu.classList.remove('visible');
        });
      });

      // ESC键关闭菜单
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          document.querySelectorAll('.context-menu.visible').forEach(menu => {
            menu.classList.remove('visible');
          });
        }
      });
    },
    /**
     * 显示自定义上下文菜单
     * @param {Event} event - 触发事件
     * @param {Array} items - 菜单项数组 {id, text, callback, disabled, divider}
     * @param {Object} options - 配置选项
     * @returns {HTMLElement} 菜单元素
     */
    show: function(event, items = [], options = {}) {
      const menuId = options.menuId || 'general-context-menu';
      
      if (options.preventDefaultAndStopPropagation !== false) {
        event.preventDefault();
        event.stopPropagation();
      }
      
      // 创建或获取上下文菜单
      let contextMenu = document.getElementById(menuId);
      if (!contextMenu) {
        contextMenu = Utils.createElement('div', 'context-menu', {id: menuId});
        document.body.appendChild(contextMenu);
      }
      
      // 清空旧内容
      contextMenu.innerHTML = '';
      
      // 创建菜单项
      items.forEach(item => {
        if (item.divider) {
          contextMenu.appendChild(Utils.createElement('div', 'context-menu-divider'));
          return;
        }
        
        const menuItem = Utils.createElement(
          'div', 
          `context-menu-item${item.disabled ? ' disabled' : ''}${item.class ? ' ' + item.class : ''}`, 
          {id: item.id || ''},
          item.text || ''
        );
        
        if (!item.disabled && typeof item.callback === 'function') {
          menuItem.addEventListener('click', () => {
            item.callback();
            contextMenu.classList.remove('visible');
          });
        }
        
        contextMenu.appendChild(menuItem);
      });
      
      // 设置菜单位置
      contextMenu.style.left = `${event.pageX}px`;
      contextMenu.style.top = `${event.pageY}px`;
      contextMenu.classList.add('visible');
      
      return contextMenu;
    },
    /**
     * 隐藏所有上下文菜单
     */
    hideAll: function() {
      document.querySelectorAll('.context-menu').forEach(menu => {
        menu.classList.remove('visible');
      });
    }
  },
  /**
   * 图像选择器
   * @namespace Menu.ImageSelector
   */
  ImageSelector: {
    /**
     * 显示图像选择模态框
     * @param {Object} options - 配置选项
     * @returns {HTMLElement} 模态框元素
     */
    show: function(options = {}) {
      const {
        title = I18n.getMessage('selectImage', '选择图片'),
        modalId = 'image-selector-modal',
        onConfirm = () => {},
        onReset = null,
        onCancel = () => {},
        allowUrl = true,
        allowUpload = true,
        showReset = false,
        mode = 'icon', // 默认为图标模式
        confirmText = I18n.getMessage('confirm', '确认'),
        cancelText = I18n.getMessage('cancel', '取消'),
        resetText = I18n.getMessage('resetIcon', '重置'),
        urlPlaceholder = 'https://example.com/image.png',
        maxWidth = mode === 'icon' ? 256 : 1920,
        maxHeight = mode === 'icon' ? 256 : 1080,
        quality = 1,
        urlLabel = I18n.getMessage('imageUrl', '图片URL'),
        uploadLabel = I18n.getMessage('uploadImage', '上传图片')
      } = options;

      // 删除旧的模态框（如果存在）以避免事件绑定问题
      const oldModal = document.getElementById(modalId);
      if (oldModal) {
        oldModal.remove();
      }

      // 创建新的模态框
      const modal = Utils.createElement('div', 'modal', {id: modalId});
      
      const modalContentClass = mode === 'background' ? 
        'modal-content modal-content-wide' : 
        'modal-content';
      
      const modalContent = Utils.createElement('div', modalContentClass);
      
      // 构建模态框内容
      const modalClose = Utils.createElement('span', 'modal-close', {}, '&times;');
      const modalTitle = Utils.createElement('h2', '', {}, title);
      const modalForm = Utils.createElement('div', 'modal-form');
      
      // 添加到模态框
      modalContent.appendChild(modalClose);
      modalContent.appendChild(modalTitle);
      
      // URL输入框（如果允许）
      if (allowUrl) {
        const formGroup = Utils.createElement('div', 'form-group');
        const label = Utils.createElement('label', '', { for: `${modalId}-url` }, urlLabel);
        const input = Utils.createElement('input', '', { 
          id: `${modalId}-url`, 
          type: 'url', 
          placeholder: urlPlaceholder 
        });
        
        formGroup.append(label, input);
        modalForm.appendChild(formGroup);
      }
      
      // 文件上传（如果允许）
      if (allowUpload) {
        const formGroup = Utils.createElement('div', 'form-group');
        const label = Utils.createElement('label', '', { for: `${modalId}-upload` }, uploadLabel);
        const input = Utils.createElement('input', '', { 
          id: `${modalId}-upload`, 
          type: 'file',
          accept: 'image/*' 
        });
        
        formGroup.append(label, input);
        modalForm.appendChild(formGroup);
      }
      
      // 预览区
      const previewClass = `image-preview ${mode === 'background' ? 'image-preview-bg' : 'image-preview-icon'}`;
      const preview = Utils.createElement('div', previewClass, { id: `${modalId}-preview` });
      modalForm.appendChild(preview);
      
      // 按钮组
      const formActions = Utils.createElement('div', 'form-actions');
      
      // 添加重置按钮（如果需要）
      if (showReset && typeof onReset === 'function') {
        const resetBtn = Utils.createElement('button', 'btn btn-danger', { id: `${modalId}-reset` }, resetText);
        formActions.appendChild(resetBtn);
      }
      
      const cancelBtn = Utils.createElement('button', 'btn', { id: `${modalId}-cancel` }, cancelText);
      const confirmBtn = Utils.createElement('button', 'btn btn-primary', { id: `${modalId}-confirm` }, confirmText);
      
      formActions.append(cancelBtn, confirmBtn);
      modalForm.appendChild(formActions);
      
      modalContent.appendChild(modalForm);
      modal.appendChild(modalContent);
      document.body.appendChild(modal);
      
      // 直接绑定事件（而不是使用独立的方法）
      
      // 处理关闭按钮
      modalClose.addEventListener('click', () => {
        Menu.Modal.hide(modalId);
        onCancel();
      });
      
      // 处理文件上传事件
      if (allowUpload) {
        const uploadInput = document.getElementById(`${modalId}-upload`);
        uploadInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function(event) {
            const imageData = event.target.result;
            console.log('Image loaded, size:', imageData.length);
            
            const preview = document.getElementById(`${modalId}-preview`);
            if (preview) {
              if (mode === 'background') {
              // 背景图片预览 - 使用当前网页比例
              const currentAspectRatio = window.innerWidth / window.innerHeight;
              preview.innerHTML = `<img src="${imageData}" alt="" style="width: 100%; object-fit: cover; aspect-ratio: ${currentAspectRatio};">`;
              } else {
              // 图标预览 - 保持方形比例
              preview.innerHTML = `<img src="${imageData}" alt="" style="width: 64px; height: 64px; object-fit: contain;">`;
              }
            }
            };
            
          reader.onerror = function(error) {
            console.error('FileReader error:', error); // 调试日志
            const preview = document.getElementById(`${modalId}-preview`);
            if (preview) {
              preview.innerHTML = `<div class="error-message">${I18n.getMessage('imageLoadError', '图片加载失败')}</div>`;
            }
          };
          
          reader.readAsDataURL(file);
        });
      }
      
      // URL输入预览功能
      if (allowUrl) {
        const urlInput = document.getElementById(`${modalId}-url`);
        urlInput.addEventListener('input', Utils.debounce(function() {
          const url = this.value.trim();
          if (!url) return;
          const preview = document.getElementById(`${modalId}-preview`);
          if (!preview) return;
          
          preview.innerHTML = `<div class="loading-spinner"></div>`;
          
          const img = new Image();
          img.onload = function() {
            if (mode === 'background') {
              // 背景图片预览 - 保持16:9比例并填满预览区域
              preview.innerHTML = `<img src="${url}" alt="" style="width: 100%; object-fit: cover; aspect-ratio: 16/9;">`;
            } else {
              // 图标预览 - 保持方形比例
              preview.innerHTML = `<img src="${url}" alt="" style="width: 64px; height: 64px; object-fit: contain;">`;
            }
          };
          
          img.onerror = function(error) {
            console.error('Image URL error:', error); // 调试日志
            preview.innerHTML = `<div class="error-message">${I18n.getMessage('imageLoadError', '图片加载失败')}</div>`;
          };
          
          img.src = url;
        }, 500));
      }
      
      // 绑定确认按钮事件
      confirmBtn.addEventListener('click', async () => {
        let imageData = null;
        
        // 优先使用上传的图片
        const uploadInput = document.getElementById(`${modalId}-upload`);
        const file = uploadInput && uploadInput.files[0];
        
        if (file) {
          try {
            imageData = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target.result);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          } catch (error) {
            console.error('Failed to process image:', error);
            Notification.notify({
              title: I18n.getMessage('error', '错误'),
              message: error.message || I18n.getMessage('imageProcessingError', '图片处理失败'),
              type: 'error',
              duration: 5000
            });
            return;
          }
        } else if (allowUrl) {
          // 其次使用URL
          const urlInput = document.getElementById(`${modalId}-url`);
          const url = urlInput && urlInput.value.trim();
          if (url) {
            imageData = url;
          }
        }
        
        Menu.Modal.hide(modalId);
        onConfirm(imageData);
      });
      
      // 绑定取消按钮事件
      cancelBtn.addEventListener('click', () => {
        Menu.Modal.hide(modalId);
        onCancel();
      });
      
      // 绑定重置按钮事件（如果存在）
      if (showReset && typeof onReset === 'function') {
        const resetBtn = document.getElementById(`${modalId}-reset`);
        resetBtn.addEventListener('click', () => {
          Menu.Modal.hide(modalId);
          onReset();
        });
      }      // 显示模态框
      Menu.Modal.show(modalId);
      
      // 添加拖动和网格支持
      const imageModalContent = modal.querySelector('.modal-content');
      if (imageModalContent) {
        Menu._makeModalDraggable(modal, imageModalContent, { 
          gridSnap: options.gridSnap !== false 
        });
      }
      
      // 如果存在onShow回调，执行它
      if (typeof options.onShow === 'function') {
        setTimeout(() => {
          options.onShow();
        }, 100);
      }
      
      return modal;
    }
  },
  /**
   * 使模态框可拖动（支持网格吸附/降级）
   * @param {HTMLElement} modal - 模态框元素
   * @param {HTMLElement} modalContent - 内容元素
   * @param {Object} options - 拖动选项
   */
  _makeModalDraggable: function(modal, modalContent, options = {}) {
    // 查找模态框标题元素作为拖动区域
    const dragHandle = modalContent.querySelector('.modal-header, h2');
    
    if (!dragHandle) return;
    
    // 添加指示可拖动的样式
    dragHandle.classList.add('draggable');
    
    // 添加拖动提示
    dragHandle.title = I18n.getMessage('modalDragHint', '拖拽移动窗口，按住Shift键进行网格吸附');
    
    // 使用网格系统的统一拖拽功能
    if (window.GridSystem && typeof window.GridSystem.registerDraggable === 'function') {
      const dragController = window.GridSystem.registerDraggable(modalContent, {
        gridSnapEnabled: options.gridSnap !== false,
        showGridHint: true,
        dragHandle: dragHandle,
        onDragStart: (e, dragState) => {
          modalContent.classList.add('dragging');
          document.body.classList.add('modal-dragging');
        },
        onDragMove: (e, dragState, position) => {
          // 确保模态框不会被拖出屏幕
          Menu._keepModalInViewport(modalContent);
        },
        onDragEnd: (e, dragState) => {
          modalContent.classList.remove('dragging');
          document.body.classList.remove('modal-dragging');
        }
      });
      
      // 保存拖动状态到modalContent以便其他方法访问
      modalContent._dragState = {
        isDragging: () => {
          const state = window.GridSystem.dragStates.get(modalContent);
          return state ? state.isDragging : false;
        },
        gridSnapEnabled: () => {
          const state = window.GridSystem.dragStates.get(modalContent);
          return state ? state.gridSnapEnabled : false;
        },
        setGridSnap: (enabled) => {
          if (dragController) {
            dragController.setGridSnapEnabled(enabled);
          }
        }
      };
    } else {
      // 降级到原始拖拽实现
      this._makeModalDraggableFallback(modal, modalContent, options);
    }
  },
  /**
   * 使模态框保持在视窗内
   * @param {HTMLElement} modalContent - 内容元素
   */
  _keepModalInViewport: function(modalContent) {
    const rect = modalContent.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // 检查并调整水平位置
    if (rect.left < 0) {
      modalContent.style.left = '0px';
    } else if (rect.right > viewportWidth) {
      modalContent.style.left = `${viewportWidth - rect.width}px`;
    }
    
    // 检查并调整垂直位置
    if (rect.top < 0) {
      modalContent.style.top = '0px';
    } else if (rect.bottom > viewportHeight) {
      modalContent.style.top = `${viewportHeight - rect.height}px`;
    }
  },
  /**
   * 网格吸附功能
   * @param {number} x - X 坐标
   * @param {number} y - Y 坐标
   * @param {number} width - 元素宽度
   * @param {number} height - 元素高度
   * @returns {Object} 吸附后的位置 {x, y}
   */
  _snapToGrid: function(x, y, width, height) {
    if (!window.GridSystem || !window.GridSystem.gridEnabled) {
      return { x, y };
    }
    
    try {
      // 使用网格系统的吸附功能
      const gridPosition = window.GridSystem.pixelToGridPosition(x, y, width, height);
      const snappedPosition = window.GridSystem.gridToPixelPosition(gridPosition);
      
      return {
        x: snappedPosition.left,
        y: snappedPosition.top
      };
    } catch (error) {
      console.warn('网格吸附失败:', error);
      return { x, y };
    }
  },
  /**
   * 显示网格提示
   * @param {HTMLElement} modalContent - 内容元素
   */
  _showGridHint: function(modalContent) {
    let hint = document.getElementById('modal-grid-hint');
    if (!hint) {
      hint = Utils.createElement('div', 'modal-grid-hint', { id: 'modal-grid-hint' });
      document.body.appendChild(hint);
    }
    
    hint.innerHTML = `
      <div class="grid-hint-content">
        <span class="grid-hint-icon">⊞</span>
        <span class="grid-hint-text">${I18n.getMessage('gridSnapHint', '按住 Shift 键进行网格吸附')}</span>
      </div>
    `;
    
    hint.classList.add('visible');
  },
  /**
   * 更新网格提示状态
   * @param {HTMLElement} modalContent - 内容元素
   * @param {boolean} isSnapping - 是否正在吸附
   */
  _updateGridHint: function(modalContent, isSnapping) {
    const hint = document.getElementById('modal-grid-hint');
    if (!hint) return;
    
    const content = hint.querySelector('.grid-hint-content');
    if (!content) return;
    
    if (isSnapping) {
      content.innerHTML = `
        <span class="grid-hint-icon active">⊞</span>
        <span class="grid-hint-text active">${I18n.getMessage('gridSnapping', '网格吸附已启用')}</span>
      `;
      hint.classList.add('snapping');
    } else {
      content.innerHTML = `
        <span class="grid-hint-icon">⊞</span>
        <span class="grid-hint-text">${I18n.getMessage('gridSnapHint', '按住 Shift 键进行网格吸附')}</span>
      `;
      hint.classList.remove('snapping');
    }
  },
  /**
   * 隐藏网格提示
   */
  _hideGridHint: function() {
    const hint = document.getElementById('modal-grid-hint');
    if (hint) {
      hint.classList.remove('visible', 'snapping');
      setTimeout(() => {
        if (hint.parentNode) {
          hint.parentNode.removeChild(hint);
        }
      }, 300);
    }
  },
  /**
   * 使模态框居中显示
   * @param {HTMLElement} modal - 模态框元素
   * @param {HTMLElement} modalContent - 内容元素
   */
  _centerModal: function(modal, modalContent) {
    // 重置任何之前设置的位置
    modalContent.style.position = 'relative';
    modalContent.style.left = 'auto';
    modalContent.style.top = 'auto';
    modalContent.style.transform = 'none';
    
    // 必须在下一个宏任务中执行，确保元素已经渲染
    setTimeout(() => {
      // 获取模态框大小
      const rect = modalContent.getBoundingClientRect();
      
      // 计算居中位置
      const x = (window.innerWidth - rect.width) / 2;
      const y = (window.innerHeight - rect.height) / 2;
      
      // 更新位置并使用绝对定位
      modalContent.style.position = 'absolute';
      modalContent.style.left = `${x}px`;
      modalContent.style.top = `${y}px`;
      modalContent.style.margin = '0';
    }, 0);
  },
  /**
   * 降级的模态框拖拽实现（当网格系统不可用时使用）
   * @param {HTMLElement} modal - 模态框元素
   * @param {HTMLElement} modalContent - 内容元素
   * @param {Object} options - 拖动选项
   */
  _makeModalDraggableFallback: function(modal, modalContent, options = {}) {
    let isDragging = false;
    let dragStartX, dragStartY;
    let offsetX, offsetY;
    let gridSnapEnabled = options.gridSnap !== false;
    let gridSnapKeyPressed = false;
    
    const dragHandle = modalContent.querySelector('.modal-header, h2');
    if (!dragHandle) return;
    
    // 开始拖动
    const startDrag = (e) => {
      if (e.button !== 0) return;
      
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      
      const rect = modalContent.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      
      e.preventDefault();
      e.stopPropagation();
      
      modalContent.classList.add('dragging');
      document.body.classList.add('modal-dragging');
      
      if (window.GridSystem && window.GridSystem.gridEnabled) {
        Menu._showGridHint(modalContent);
      }
    };
    
    // 拖动过程
    const handleDrag = (e) => {
      if (!isDragging) return;
      
      gridSnapKeyPressed = e.shiftKey;
      
      let x = e.clientX - offsetX;
      let y = e.clientY - offsetY;
      
      if (gridSnapEnabled && gridSnapKeyPressed && window.GridSystem && window.GridSystem.gridEnabled) {
        const snappedPos = Menu._snapToGrid(x, y, modalContent.offsetWidth, modalContent.offsetHeight);
        x = snappedPos.x;
        y = snappedPos.y;
        modalContent.classList.add('grid-snapping');
      } else {
        modalContent.classList.remove('grid-snapping');
      }
      
      modalContent.style.left = `${x}px`;
      modalContent.style.top = `${y}px`;
      
      Menu._keepModalInViewport(modalContent);
      
      if (window.GridSystem && window.GridSystem.gridEnabled) {
        Menu._updateGridHint(modalContent, gridSnapKeyPressed);
      }
    };
    
    // 结束拖动
    const endDrag = (e) => {
      if (!isDragging) return;
      
      isDragging = false;
      modalContent.classList.remove('dragging', 'grid-snapping');
      document.body.classList.remove('modal-dragging');
      
      if (gridSnapEnabled && gridSnapKeyPressed && window.GridSystem && window.GridSystem.gridEnabled) {
        const currentLeft = parseInt(modalContent.style.left) || 0;
        const currentTop = parseInt(modalContent.style.top) || 0;
        const snappedPos = Menu._snapToGrid(currentLeft, currentTop, modalContent.offsetWidth, modalContent.offsetHeight);
        
        modalContent.style.transition = 'left 0.2s ease-out, top 0.2s ease-out';
        modalContent.style.left = `${snappedPos.x}px`;
        modalContent.style.top = `${snappedPos.y}px`;
        
        setTimeout(() => {
          modalContent.style.transition = '';
        }, 200);
      }
      
      Menu._hideGridHint();
    };
    
    // 绑定事件
    dragHandle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', endDrag);
    
    // 键盘事件监听
    document.addEventListener('keydown', (e) => {
      if (isDragging && e.key === 'Shift') {
        gridSnapKeyPressed = true;
        if (window.GridSystem && window.GridSystem.gridEnabled) {
          Menu._updateGridHint(modalContent, true);
        }
      }
    });
    
    document.addEventListener('keyup', (e) => {
      if (isDragging && e.key === 'Shift') {
        gridSnapKeyPressed = false;
        modalContent.classList.remove('grid-snapping');
        if (window.GridSystem && window.GridSystem.gridEnabled) {
          Menu._updateGridHint(modalContent, false);
        }
      }
    });
    
    // 保存拖动状态
    modalContent._dragState = {
      isDragging: () => isDragging,
      gridSnapEnabled: () => gridSnapEnabled,
      setGridSnap: (enabled) => { gridSnapEnabled = enabled; }
    };
  }
};

// 只在 DOM 环境中执行初始化代码
if (typeof document !== 'undefined') {
  // 监听工具模块的UI事件初始化，然后初始化菜单系统
  document.addEventListener('utils-ui-events-initialized', () => {
    Menu.Modal.initEvents();
    Menu.ContextMenu.init();
  });

  // 如果工具模块已经初始化过了，直接初始化菜单系统
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        Menu.Modal.initEvents();
        Menu.ContextMenu.init();
      }, 100);
    });
  } else {
    // 文档已经加载完成，延迟初始化
    setTimeout(() => {
      Menu.Modal.initEvents();
      Menu.ContextMenu.init();
    }, 100);
  }
}