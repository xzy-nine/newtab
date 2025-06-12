#!/usr/bin/env python3
"""
变更日志生成器
用于生成基于AI分析的版本变更日志

支持的运行模式:
1. workflow_call: 工作流调用模式
2. auto_release: 自动发布模式
3. manual_optimize: 手动优化模式
4. batch_all: 批量处理所有模式

依赖: requests, gitpython
"""

import os
import sys
import json
import re
import argparse
import logging
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import subprocess
import requests
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
import time


class RunMode(Enum):
    WORKFLOW_CALL = "workflow_call"
    AUTO_RELEASE = "auto_release"
    MANUAL_OPTIMIZE = "manual_optimize"
    BATCH_ALL = "batch_all"


@dataclass
class CommitInfo:
    hash: str
    message: str
    body: str = ""
    category: str = "OTHER"
    importance: int = 1


@dataclass
class AnalysisResult:
    categories: Dict[str, List[Dict[str, Any]]]
    summary: str
    highlights: List[str]


@dataclass
class BatchStats:
    """批量处理统计信息"""
    total_releases: int = 0
    processed_releases: int = 0
    success_count: int = 0
    ai_success_count: int = 0
    skipped_count: int = 0
    error_count: int = 0
    total_commits: int = 0
    start_time: float = 0
    
    def __post_init__(self):
        self.start_time = time.time()


class AIChangelogGenerator:
    """AI变更日志生成器主类"""
    
    def __init__(self, github_token: str, deepseek_api_key: str, repo: str):
        """
        初始化生成器
        
        Args:
            github_token: GitHub Personal Access Token
            deepseek_api_key: DeepSeek API密钥
            repo: GitHub仓库名 (格式: owner/repo)
        """
        self.github_token = github_token
        self.deepseek_api_key = deepseek_api_key
        self.repo = repo
        self.logger = self._setup_logger()
        
        # 批量处理统计
        self.batch_stats = BatchStats()
        
        # 步骤计数器
        self.current_step = 0
        self.total_steps = 0
        
        # 加载外部配置文件
        self._load_configs()
        
        # GitHub API基础URL
        self.github_api_base = "https://api.github.com"
        self.deepseek_api_base = "https://api.deepseek.com/v1"
        
        # 请求头设置
        self.github_headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        self.deepseek_headers = {
            "Authorization": f"Bearer {deepseek_api_key}",
            "Content-Type": "application/json"
        }
        
        # 实时摘要管理
        self.step_summary_file = os.getenv('GITHUB_STEP_SUMMARY')
        self.summary_sections = {}
    
    def _print_step_summary(self, step_name: str, status: str = "进行中", details: List[str] = None, 
                           progress: Optional[Tuple[int, int]] = None):
        """
        输出步骤摘要
        
        Args:
            step_name: 步骤名称
            status: 状态（进行中、完成、失败）
            details: 详细信息列表
            progress: 进度信息 (当前, 总数)
        """
        # 状态图标映射
        status_icons = {
            "进行中": "🔄",
            "完成": "✅", 
            "失败": "❌",
            "跳过": "⏩",
            "警告": "⚠️"
        }
        
        icon = status_icons.get(status, "ℹ️")
        
        # 输出标题
        print(f"\n{'='*60}")
        if progress:
            print(f"{icon} [{progress[0]}/{progress[1]}] {step_name} - {status}")
        else:
            print(f"{icon} {step_name} - {status}")
        print(f"{'='*60}")
        
        # 输出详细信息
        if details:
            for detail in details:
                print(f"  {detail}")
        
        # 添加时间戳
        print(f"  ⏰ 时间: {datetime.now().strftime('%H:%M:%S')}")
        print(f"{'='*60}")
        
        # 刷新输出
        sys.stdout.flush()
        
        # 更新GitHub Actions摘要
        detail_text = ""
        if details:
            detail_text = "; ".join(details[:2])  # 只取前两条详细信息避免过长
        
        self._update_github_summary(step_name, detail_text, status)
    
    def _update_progress(self, current: int, total: int, description: str = ""):
        """
        更新进度显示
        
        Args:
            current: 当前进度
            total: 总数
            description: 描述信息
        """
        if total > 0:
            percentage = (current / total) * 100
            bar_length = 30
            filled_length = int(bar_length * current // total)
            bar = '█' * filled_length + '░' * (bar_length - filled_length)
            
            print(f"\r📊 进度: [{bar}] {percentage:.1f}% ({current}/{total}) {description}", end='', flush=True)
            
            # 完成时换行
            if current == total:
                print()
    
    def _load_configs(self):
        """加载外部配置文件"""
        try:
            script_dir = Path(__file__).parent
            
            # 加载提示词配置
            with open(script_dir / 'prompts.json', 'r', encoding='utf-8') as f:
                self.prompts = json.load(f)
            
            # 加载API配置
            with open(script_dir / 'config.json', 'r', encoding='utf-8') as f:
                self.config = json.load(f)
            
            # 加载模板配置
            with open(script_dir / 'templates.json', 'r', encoding='utf-8') as f:
                self.templates = json.load(f)
            
            self.logger.info("✅ 配置文件加载成功")
            
        except Exception as e:
            self.logger.error(f"❌ 加载配置文件失败: {e}")
            raise Exception(f"配置文件加载失败，请确保所有配置文件存在且格式正确: {e}")
    
    def _setup_logger(self) -> logging.Logger:
        """设置日志记录器"""
        logger = logging.getLogger("ai_changelog")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            formatter = logging.Formatter(
                '%(asctime)s - %(levelname)s - %(message)s',
                datefmt='%Y-%m-%d %H:%M:%S'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def validate_params(self, version: Optional[str] = None, release_id: Optional[str] = None, 
                       tag: Optional[str] = None, target: Optional[str] = None,
                       event_name: str = "workflow_dispatch") -> Tuple[RunMode, str, Optional[str]]:
        """
        验证输入参数并确定运行模式
        
        Args:
            version: 版本号 (自动触发时使用)
            release_id: Release ID (自动触发时使用)
            tag: 标签 (旧版手动触发兼容)
            target: 目标版本或标签 (新版手动触发使用)
            event_name: 事件名称
            
        Returns:
            Tuple[运行模式, 版本号, Release ID]
        """
        self._print_step_summary("参数验证", "进行中", ["检查输入参数...", "确定运行模式..."])
        
        if event_name == "workflow_call":
            # 自动触发模式：需要version和release_id
            if not version or not release_id:
                self._print_step_summary("参数验证", "失败", ["缺少必需的版本号或Release ID"])
                raise ValueError("工作流调用模式需要提供版本号和Release ID")
            mode = RunMode.WORKFLOW_CALL
            self._print_step_summary("参数验证", "完成", [
                f"✓ 运行模式: 工作流调用",
                f"✓ 版本号: {version}",
                f"✓ Release ID: {release_id}"
            ])
            return mode, version, release_id
            
        else:
            # 手动触发模式
            if target:
                # 新版手动触发：使用target参数
                if target.lower() == 'latest':
                    # 获取最新的release
                    self._print_step_summary("参数验证", "进行中", ["目标: latest", "正在获取最新Release..."])
                    latest_version, latest_release_id = self._get_latest_release()
                    mode = RunMode.MANUAL_OPTIMIZE
                    self._print_step_summary("参数验证", "完成", [
                        f"✓ 运行模式: 手动优化",
                        f"✓ 最新版本: {latest_version}",
                        f"✓ Release ID: {latest_release_id}"
                    ])
                    return mode, latest_version, latest_release_id
                elif target.lower() == 'all':
                    # 批量处理所有release
                    mode = RunMode.BATCH_ALL
                    self._print_step_summary("参数验证", "完成", [
                        f"✓ 运行模式: 批量处理",
                        f"✓ 处理范围: 所有Release"
                    ])
                    return mode, "all", None
                else:
                    # 指定版本的手动触发
                    mode = RunMode.MANUAL_OPTIMIZE
                    self._print_step_summary("参数验证", "完成", [
                        f"✓ 运行模式: 手动优化",
                        f"✓ 指定版本: {target}"
                    ])
                    return mode, target, None
                    
            elif tag:
                # 旧版手动触发兼容：使用tag参数
                if tag.lower() == 'all':
                    mode = RunMode.BATCH_ALL
                    self._print_step_summary("参数验证", "完成", [
                        f"✓ 运行模式: 批量处理(兼容模式)",
                        f"✓ 处理范围: 所有Release"
                    ])
                    return mode, "all", None
                else:
                    mode = RunMode.MANUAL_OPTIMIZE
                    self._print_step_summary("参数验证", "完成", [
                        f"✓ 运行模式: 手动优化(兼容模式)",
                        f"✓ 标签: {tag}"
                    ])
                    return mode, tag, None
                    
            elif release_id:
                # 旧版自动触发兼容：有release_id但没有version
                if not version:
                    self._print_step_summary("参数验证", "失败", ["兼容模式缺少版本号"])
                    raise ValueError("自动发布模式需要提供版本号")
                mode = RunMode.AUTO_RELEASE
                self._print_step_summary("参数验证", "完成", [
                    f"✓ 运行模式: 自动发布(兼容模式)",
                    f"✓ 版本: {version}",
                    f"✓ Release ID: {release_id}"
                ])
                return mode, version, release_id
                
            else:
                self._print_step_summary("参数验证", "失败", ["缺少必需的target参数"])
                raise ValueError("手动模式需要提供target参数，或使用兼容的tag参数")
    
    def _get_latest_release(self) -> Tuple[str, str]:
        """
        获取最新的Release信息
        
        Returns:
            Tuple[版本标签, Release ID]
        """
        url = f"{self.github_api_base}/repos/{self.repo}/releases/latest"
        response = requests.get(url, headers=self.github_headers)
        
        if response.status_code != 200:
            error_msg = f"无法获取最新Release信息: {response.json().get('message', '未知错误')}"
            raise Exception(error_msg)
        
        release_data = response.json()
        tag_name = release_data['tag_name']
        release_id = str(release_data['id'])
        
        return tag_name, release_id

    def get_release_info(self, mode: RunMode, version: str, release_id: Optional[str] = None) -> Tuple[str, str]:
        """
        获取Release信息
        
        Args:
            mode: 运行模式
            version: 版本号
            release_id: Release ID (可选)
            
        Returns:
            Tuple[Release ID, 原始变更日志]
        """
        self._print_step_summary("获取Release信息", "进行中", [
            f"版本: {version}",
            f"Release ID: {release_id or '通过标签获取'}"
        ])
        
        if mode == RunMode.AUTO_RELEASE and release_id:
            # 通过Release ID获取信息
            url = f"{self.github_api_base}/repos/{self.repo}/releases/{release_id}"
        else:
            # 通过标签获取信息
            url = f"{self.github_api_base}/repos/{self.repo}/releases/tags/{version}"
        
        response = requests.get(url, headers=self.github_headers)
        
        if response.status_code != 200:
            error_msg = f"无法获取Release信息: {response.json().get('message', '未知错误')}"
            self._print_step_summary("获取Release信息", "失败", [error_msg])
            raise Exception(error_msg)
        
        release_data = response.json()
        release_id = str(release_data['id'])
        original_changelog = release_data.get('body', '')
        
        self._print_step_summary("获取Release信息", "完成", [
            f"✓ Release ID: {release_id}",
            f"✓ 原始变更日志长度: {len(original_changelog)} 字符"
        ])
        
        return release_id, original_changelog
    
    def check_optimization_status(self, mode: RunMode, original_changelog: str) -> Tuple[bool, str]:
        """
        检查是否需要优化变更日志
        
        Args:
            mode: 运行模式
            original_changelog: 原始变更日志
            
        Returns:
            Tuple[是否需要优化, 处理后的原始内容]
        """
        self._print_step_summary("检查优化状态", "进行中", ["强制从Git历史获取提交信息..."])
        
        # 强制所有模式都从Git历史重新获取，不使用发布页内容
        if mode == RunMode.MANUAL_OPTIMIZE:
            self._print_step_summary("检查优化状态", "完成", [
                "✓ 手动优化模式: 强制重新生成",
                "✓ 将从Git历史重新获取所有提交信息",
                "✓ 需要优化"
            ])
            # 返回空字符串，强制从Git获取
            return True, ""
        else:
            # 自动模式也强制从Git获取，不检查已有内容
            self._print_step_summary("检查优化状态", "完成", [
                "✓ 自动模式: 强制从Git历史获取",
                "✓ 忽略原有变更日志内容",
                "✓ 需要优化"
            ])
            # 返回空字符串，强制从Git获取
            return True, ""
    
    def get_git_commits(self, version: str) -> Tuple[List[CommitInfo], str, int]:
        """
        获取Git提交信息
        
        Args:
            version: 当前版本标签
            
        Returns:
            Tuple[提交列表, 提交范围描述, 提交数量]
        """
        self._print_step_summary("获取提交信息", "进行中", [
            f"当前版本: {version}",
            "正在分析Git历史..."
        ])
        
        try:
            # 获取所有标签并按版本号排序
            result = subprocess.run(
                ["git", "tag", "--sort=-version:refname"],
                capture_output=True, text=True, check=True
            )
            all_tags = [tag.strip() for tag in result.stdout.split('\n') if tag.strip()]
            
            # 找到当前版本在标签列表中的位置
            current_index = -1
            version_pattern = re.compile(r'^v?[0-9]+\.[0-9]+(\.[0-9]+)?.*$')
            
            # 过滤出有效的版本标签
            valid_tags = [tag for tag in all_tags if version_pattern.match(tag)]
            
            # 找到当前版本的索引
            try:
                current_index = valid_tags.index(version)
            except ValueError:
                self.logger.warning(f"⚠️ 未在标签列表中找到版本 {version}")
                current_index = -1
            
            # 确定上一个版本标签
            last_tag = None
            if current_index >= 0 and current_index < len(valid_tags) - 1:
                last_tag = valid_tags[current_index + 1]
            
            # 确定提交范围和Git命令
            if not last_tag:
                git_cmd = ["git", "log", version, "--pretty=format:%h|%s|%b", "--no-merges"]
                commit_range = f"初始版本到{version}"
                range_desc = "首次发布或未找到上个版本"
            else:
                git_cmd = ["git", "log", f"{last_tag}..{version}", "--pretty=format:%h|%s|%b", "--no-merges"]
                commit_range = f"{last_tag}..{version}"
                range_desc = f"从 {last_tag} 到 {version}"
            
            self._print_step_summary("获取提交信息", "进行中", [
                f"提交范围: {range_desc}",
                "正在执行Git命令..."
            ])
            
            # 执行Git命令获取提交
            result = subprocess.run(git_cmd, capture_output=True, text=True, check=True)
            commits_raw = result.stdout.strip()
            
            if not commits_raw:
                # 尝试其他方法获取提交
                self._print_step_summary("获取提交信息", "警告", [
                    "⚠️ 未获取到提交记录",
                    "尝试其他方法..."
                ])
                
                # 尝试包含合并提交
                if last_tag:
                    git_cmd = ["git", "log", f"{last_tag}..{version}", "--pretty=format:%h|%s|%b"]
                    result = subprocess.run(git_cmd, capture_output=True, text=True, check=True)
                    commits_raw = result.stdout.strip()
                
                # 如果还是为空，尝试获取该版本标签的提交
                if not commits_raw:
                    git_cmd = ["git", "log", "-1", version, "--pretty=format:%h|%s|%b"]
                    result = subprocess.run(git_cmd, capture_output=True, text=True, check=True)
                    commits_raw = result.stdout.strip()
                    commit_range = f"版本{version}的标签提交"
                
                # 最后尝试：如果仍为空，返回空结果
                if not commits_raw:
                    self._print_step_summary("获取提交信息", "警告", [
                        f"⚠️ 版本 {version} 无法获取到任何提交记录",
                        "可能是空发布"
                    ])
                    return [], f"空发布-{version}", 0
            
            # 解析提交信息
            commits = []
            if commits_raw:
                lines = commits_raw.split('\n')
                for i, line in enumerate(lines):
                    parts = line.split('|', 2)
                    if len(parts) >= 2 and parts[0]:
                        commit = CommitInfo(
                            hash=parts[0],
                            message=parts[1].strip(),
                            body=parts[2].strip() if len(parts) > 2 else ""
                        )
                        commits.append(commit)
                    
                    # 显示解析进度
                    if i % 10 == 0 or i == len(lines) - 1:
                        self._update_progress(i + 1, len(lines), "解析提交信息")
            
            commit_count = len(commits)
            self._print_step_summary("获取提交信息", "完成", [
                f"✓ 提交范围: {commit_range}",
                f"✓ 获取到 {commit_count} 个提交记录"
            ])
            
            return commits, commit_range, commit_count
            
        except subprocess.CalledProcessError as e:
            self._print_step_summary("获取提交信息", "失败", [f"Git命令执行失败: {e}"])
            return [], f"Git错误-{version}", 0
        except Exception as e:
            self._print_step_summary("获取提交信息", "失败", [f"处理异常: {e}"])
            return [], f"处理异常-{version}", 0
    
    def classify_commits(self, commits: List[CommitInfo]) -> Dict[str, List[CommitInfo]]:
        """
        对提交进行分类
        
        Args:
            commits: 提交列表
            
        Returns:
            分类后的提交字典
        """
        self._print_step_summary("提交分类", "进行中", [
            f"待分类提交: {len(commits)} 个",
            "正在应用分类规则..."
        ])
        
        categories = self.templates["categories"]
        patterns = self.templates["commit_patterns"]
        
        classified = {category: [] for category in categories.keys()}
        
        for i, commit in enumerate(commits):
            clean_message = commit.message.strip()
            categorized = False
            
            # 按优先级匹配分类
            for category, pattern in patterns.items():
                if category == "OTHER":
                    continue
                if re.match(pattern, clean_message, re.IGNORECASE):
                    commit.category = category
                    classified[category].append(commit)
                    categorized = True
                    break
            
            # 如果没有匹配到特定分类，归类为OTHER
            if not categorized:
                commit.category = "OTHER"
                classified["OTHER"].append(commit)
            
            # 显示分类进度
            if i % 5 == 0 or i == len(commits) - 1:
                self._update_progress(i + 1, len(commits), "分类提交")
        
        # 准备分类统计
        classification_details = []
        for category, commits_list in classified.items():
            if commits_list:
                title, _ = categories[category]
                classification_details.append(f"✓ {title}: {len(commits_list)} 个")
        
        self._print_step_summary("提交分类", "完成", classification_details)
        
        return classified
    
    def call_deepseek_api(self, commits: List[CommitInfo]) -> Optional[AnalysisResult]:
        """
        调用DeepSeek API分析提交
        
        Args:
            commits: 提交列表
            
        Returns:
            AI分析结果，失败时返回None
        """
        self._print_step_summary("AI智能分析", "进行中", [
            f"准备数据: {len(commits)} 个提交",
            "正在调用DeepSeek API..."
        ])
        
        if not commits:
            self._print_step_summary("AI智能分析", "失败", ["没有可用的提交数据"])
            return None
        
        # 准备提交数据
        commits_text = ""
        for commit in commits:
            commits_text += f"{commit.hash}|{commit.message}\n"
        
        # 构建API请求
        system_prompt = self.prompts["system_prompt"]
        user_prompt = self.prompts["user_prompt_template"].format(commits_text=commits_text)

        api_config = self.config["deepseek_api"]
        request_data = {
            "model": api_config["model"],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": api_config["temperature"],
            "max_tokens": api_config["max_tokens"]
        }
        
        try:
            # 发送API请求
            response = requests.post(
                f"{self.deepseek_api_base}/chat/completions",
                headers=self.deepseek_headers,
                json=request_data,
                timeout=api_config["timeout"]
            )
            
            if response.status_code != 200:
                error_msg = f"HTTP错误 {response.status_code}: {response.json().get('error', {}).get('message', '未知HTTP错误')}"
                self._print_step_summary("AI智能分析", "失败", [error_msg])
                return None
            
            response_data = response.json()
            
            if 'choices' not in response_data or not response_data['choices']:
                self._print_step_summary("AI智能分析", "失败", ["API响应格式异常: 缺少choices字段"])
                return None
            
            ai_content = response_data['choices'][0]['message']['content']
            
            if not ai_content:
                self._print_step_summary("AI智能分析", "失败", ["AI响应内容为空"])
                return None
            
            # 尝试解析JSON结果
            try:
                # 首先尝试直接解析
                ai_data = json.loads(ai_content)
                self._print_step_summary("AI智能分析", "完成", [
                    "✅ DeepSeek API调用成功",
                    "✅ JSON格式解析成功",
                    f"✓ 分析摘要: {ai_data.get('summary', 'AI智能分析')[:50]}..."
                ])
                
                return AnalysisResult(
                    categories=ai_data.get('categories', {}),
                    summary=ai_data.get('summary', 'AI智能分析的版本更新'),
                    highlights=ai_data.get('highlights', [])
                )
                
            except json.JSONDecodeError:
                # 如果直接解析失败，尝试提取代码块中的JSON
                code_block_patterns = [
                    r'```json\s*(.*?)\s*```',
                    r'```\s*(.*?)\s*```'
                ]
                
                extracted_json = None
                for pattern in code_block_patterns:
                    match = re.search(pattern, ai_content, re.DOTALL)
                    if match:
                        extracted_json = match.group(1).strip()
                        break
                
                if extracted_json:
                    try:
                        ai_data = json.loads(extracted_json)
                        self._print_step_summary("AI智能分析", "完成", [
                            "✅ DeepSeek API调用成功",
                            "✅ 代码块JSON格式解析成功",
                            f"✓ 分析摘要: {ai_data.get('summary', 'AI智能分析')[:50]}..."
                        ])
                        
                        return AnalysisResult(
                            categories=ai_data.get('categories', {}),
                            summary=ai_data.get('summary', 'AI智能分析的版本更新'),
                            highlights=ai_data.get('highlights', [])
                        )
                        
                    except json.JSONDecodeError:
                        pass
                
                # 所有解析方法都失败
                self._print_step_summary("AI智能分析", "失败", [
                    "⚠️ AI返回内容无法解析为有效JSON",
                    f"前200字符: {ai_content[:200]}..."
                ])
                return None
                
        except requests.RequestException as e:
            self._print_step_summary("AI智能分析", "失败", [f"API请求失败: {e}"])
            return None
        except Exception as e:
            self._print_step_summary("AI智能分析", "失败", [f"调用异常: {e}"])
            return None

    def generate_changelog_with_ai(self, version: str, ai_analysis: AnalysisResult, 
                                  original_changelog: str, commits: List[CommitInfo]) -> str:
        """
        使用AI分析结果生成变更日志
        
        Args:
            version: 版本号
            ai_analysis: AI分析结果
            original_changelog: 原始变更日志（将被忽略，强制使用Git提交）
            commits: 原始提交列表
            
        Returns:
            生成的变更日志
        """
        self._print_step_summary("生成AI变更日志", "进行中", [
            f"版本: {version}",
            f"亮点数量: {len(ai_analysis.highlights)}",
            "正在构建变更日志..."
        ])
        
        template = self.templates["changelog_templates"]["ai_generated"]
        categories = self.templates["categories"]
        importance_icons = self.templates["importance_icons"]
        
        # 构建变更日志
        changelog = template["header"].format(version=version) + "\n\n"
        changelog += template["overview"].format(summary=ai_analysis.summary) + "\n"
        
        # 添加主要亮点
        if ai_analysis.highlights:
            highlights_text = "\n".join(f"- {highlight}" for highlight in ai_analysis.highlights)
            changelog += template["highlights"].format(highlights=highlights_text)
        
        changelog += template["divider"]
        
        # 按优先级生成各个分类
        categories_order = ["FEATURE", "FIX", "PERF", "STYLE", "REFACTOR", "DOCS", "BUILD", "OTHER"]
        
        generated_categories = []
        for category in categories_order:
            if category in ai_analysis.categories and ai_analysis.categories[category]:
                title, _ = categories[category]
                changelog += "\n" + template["category_header"].format(title=title) + "\n"
                
                # 按重要性排序
                items = ai_analysis.categories[category]
                sorted_items = sorted(items, key=lambda x: x.get('importance', 1), reverse=True)
                
                for item in sorted_items:
                    importance = item.get('importance', 1)
                    icon = importance_icons.get(str(importance), "•")
                    message = item.get('message', '')
                    hash_val = item.get('hash', '')
                    
                    changelog += template["item_format"].format(
                        icon=icon, message=message, hash=hash_val
                    )
                
                generated_categories.append(f"{title}: {len(items)} 项")
        
        # 添加原始变更记录到折叠区域 - 强制使用Git提交信息
        changelog += "\n\n<details>\n<summary>查看原始提交记录</summary>\n\n"
        
        # 忽略original_changelog参数，强制生成基于Git提交的记录
        git_based_commits = []
        for commit in commits:
            git_based_commits.append(f"- {commit.message} ({commit.hash})")
        
        git_commits_text = "\n".join(git_based_commits) if git_based_commits else "暂无提交记录"
        changelog += git_commits_text
        changelog += "\n\n</details>"
        
        self._print_step_summary("生成AI变更日志", "完成", [
            f"✓ 变更日志长度: {len(changelog)} 字符",
            f"✓ 生成分类: {', '.join(generated_categories) if generated_categories else '无'}",
            f"✓ 折叠区域使用Git提交: {len(git_based_commits)} 条"
        ])
        
        return changelog
    
    def generate_changelog_basic(self, version: str, classified_commits: Dict[str, List[CommitInfo]], 
                               original_changelog: str) -> str:
        """
        使用基础规则生成变更日志
        
        Args:
            version: 版本号
            classified_commits: 分类后的提交
            original_changelog: 原始变更日志（将被忽略，强制使用Git提交）
            
        Returns:
            生成的变更日志
        """
        self._print_step_summary("生成基础变更日志", "进行中", [
            f"版本: {version}",
            "使用基础规则生成..."
        ])
        
        template = self.templates["changelog_templates"]["basic_generated"]
        categories = self.templates["categories"]
        
        # 构建变更日志
        changelog = template["header"].format(version=version) + "\n\n"
        changelog += template["overview"] + template["divider"]
        
        # 按优先级生成各个分类
        categories_order = ["FEATURE", "FIX", "PERF", "STYLE", "REFACTOR", "DOCS", "BUILD", "OTHER"]
        
        generated_categories = []
        for category in categories_order:
            if category in classified_commits and classified_commits[category]:
                title, _ = categories[category]
                changelog += "\n" + template["category_header"].format(title=title) + "\n"
                
                for commit in classified_commits[category]:
                    # 清理提交消息
                    clean_message = commit.message
                    
                    # 从配置获取清理规则
                    prefixes = self.templates.get("cleanup_patterns", [
                        r'^feat[:\s]*', r'^fix[:\s]*', r'^style[:\s]*', 
                        r'^refactor[:\s]*', r'^perf[:\s]*', r'^docs?[:\s]*', 
                        r'^build[:\s]*', r'^新增\s*', r'^修复\s*', r'^优化\s*'
                    ])
                    
                    for prefix in prefixes:
                        clean_message = re.sub(prefix, '', clean_message, flags=re.IGNORECASE)
                    
                    clean_message = clean_message.strip()
                    if not clean_message:
                        clean_message = commit.message
                    
                    changelog += template["item_format"].format(
                        message=clean_message, hash=commit.hash
                    )
                
                generated_categories.append(f"{title}: {len(classified_commits[category])} 项")
        
        # 添加原始变更记录到折叠区域 - 强制使用Git提交信息
        changelog += "\n\n<details>\n<summary>查看原始提交记录</summary>\n\n"
        
        # 忽略original_changelog参数，强制生成基于Git提交的记录
        all_git_commits = []
        for category, commits_list in classified_commits.items():
            for commit in commits_list:
                all_git_commits.append(f"- {commit.message} ({commit.hash})")
        
        git_commits_text = "\n".join(all_git_commits) if all_git_commits else "暂无提交记录"
        changelog += git_commits_text
        changelog += "\n\n</details>"
        
        self._print_step_summary("生成基础变更日志", "完成", [
            f"✓ 变更日志长度: {len(changelog)} 字符",
            f"✓ 生成分类: {', '.join(generated_categories) if generated_categories else '无'}",
            f"✓ 折叠区域使用Git提交: {len(all_git_commits)} 条"
        ])
        
        return changelog

    def update_release_changelog(self, release_id: str, changelog: str) -> bool:
        """
        更新Release的变更日志
        
        Args:
            release_id: Release ID
            changelog: 新的变更日志内容
            
        Returns:
            是否更新成功
        """
        self._print_step_summary("更新Release", "进行中", [
            f"Release ID: {release_id}",
            f"变更日志长度: {len(changelog)} 字符",
            "正在提交到GitHub..."
        ])
        
        url = f"{self.github_api_base}/repos/{self.repo}/releases/{release_id}"
        
        update_data = {
            "body": changelog
        }
        
        try:
            response = requests.patch(url, headers=self.github_headers, json=update_data)
            
            if response.status_code == 200:
                release_data = response.json()
                release_url = release_data.get('html_url', '')
                self._print_step_summary("更新Release", "完成", [
                    "✅ Release变更日志更新成功",
                    f"🔗 Release URL: {release_url}"
                ])
                return True
            else:
                error_msg = response.json().get('message', '未知错误')
                self._print_step_summary("更新Release", "失败", [f"更新失败: {error_msg}"])
                return False
                
        except Exception as e:
            self._print_step_summary("更新Release", "失败", [f"请求异常: {e}"])
            return False
    
    def generate_summary_report(self, mode: RunMode, version: str, release_id: str,
                              classified_commits: Dict[str, List[CommitInfo]],
                              ai_success: bool, ai_error: Optional[str] = None) -> str:
        """
        生成执行摘要报告
        
        Args:
            mode: 运行模式
            version: 版本号
            release_id: Release ID
            classified_commits: 分类后的提交
            ai_success: AI是否成功
            ai_error: AI错误信息
            
        Returns:
            摘要报告文本
        """
        total_commits = sum(len(commits) for commits in classified_commits.values())
        
        # 控制台友好的报告格式
        console_report = f"""
{'='*60}
🤖 AI变更日志生成完成
{'='*60}

📋 基本信息:
  • 运行模式: {mode.value}
  • 版本号: {version}
  • Release ID: {release_id}

🤖 AI分析状态:
  • DeepSeek API: {'✅ 调用成功' if ai_success else '❌ 调用失败'}
  • 生成方式: {'🧠 AI智能生成' if ai_success else '📝 基础规则生成'}
"""
        
        if not ai_success and ai_error:
            console_report += f"  • 失败原因: {ai_error}\n"
        
        console_report += "\n📊 提交统计:\n"
        
        for category, commits_list in classified_commits.items():
            if commits_list:  # 只显示有内容的分类
                title, _ = self.templates["categories"][category]
                console_report += f"  • {title}: {len(commits_list)}\n"
        
        console_report += f"  • 总计: {total_commits}\n"
        
        console_report += f"""
⏱️ 执行信息:
  • 执行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
  • 状态: {'✅ AI变更日志生成并更新成功' if ai_success else '⚠️ 变更日志生成并更新成功（使用基础规则）'}

{'='*60}
"""
        
        return console_report
    
    def output_github_actions_summary(self, mode: RunMode, version: str, release_id: str,
                                    classified_commits: Dict[str, List[CommitInfo]],
                                    ai_success: bool, ai_error: Optional[str] = None):
        """
        输出GitHub Actions摘要信息
        
        Args:
            mode: 运行模式
            version: 版本号
            release_id: Release ID
            classified_commits: 分类后的提交
            ai_success: AI是否成功
            ai_error: AI错误信息
        """
        # 输出到GitHub Actions Step Summary
        step_summary_file = os.getenv('GITHUB_STEP_SUMMARY')
        if step_summary_file:
            try:
                total_commits = sum(len(commits) for commits in classified_commits.values())
                
                summary_content = f"""# 🤖 AI变更日志生成报告

## 📋 执行概览
- **版本号**: `{version}`
- **运行模式**: `{mode.value}`
- **Release ID**: `{release_id}`
- **AI状态**: {'✅ 成功' if ai_success else '❌ 失败'}
- **生成方式**: {'🧠 AI智能生成' if ai_success else '📝 基础规则生成'}
- **处理提交数**: `{total_commits}`

## 📊 提交分类统计
"""
                
                for category, commits_list in classified_commits.items():
                    if commits_list:
                        title, _ = self.templates["categories"][category]
                        summary_content += f"- **{title}**: {len(commits_list)} 个提交\n"
                
                if not ai_success and ai_error:
                    summary_content += f"\n## ⚠️ 注意事项\n- AI API调用失败: {ai_error}\n- 已使用基础规则生成变更日志\n"
                
                summary_content += f"\n## ✅ 执行结果\n变更日志已成功更新到 Release 页面\n"
                
                with open(step_summary_file, 'w', encoding='utf-8') as f:
                    f.write(summary_content)
                
                self.logger.info("✅ GitHub Actions摘要已生成")
                
            except Exception as e:
                    self.logger.warning(f"⚠️ 生成GitHub Actions摘要失败: {e}")
            except Exception as e:
                    self.logger.warning(f"⚠️ 获取Git提交信息失败: {e}")
                    return [], f"Git错误-{version}", 0
        
        # 输出GitHub Actions变量
        github_output_file = os.getenv('GITHUB_OUTPUT')
        if github_output_file:
            try:
                with open(github_output_file, 'a', encoding='utf-8') as f:
                    f.write(f"ai_success={str(ai_success).lower()}\n")
                    f.write(f"total_commits={sum(len(commits) for commits in classified_commits.values())}\n")
                    f.write(f"generation_mode={'ai' if ai_success else 'basic'}\n")
            except Exception as e:
                self.logger.warning(f"⚠️ 设置GitHub Actions输出变量失败: {e}")
    
    def get_all_releases(self) -> List[Dict[str, Any]]:
        """
        获取所有Release信息
        
        Returns:
            Release列表
        """
        self.logger.info("📋 获取所有Release信息...")
        
        all_releases = []
        page = 1
        per_page = 30
        
        while True:
            url = f"{self.github_api_base}/repos/{self.repo}/releases"
            params = {
                'page': page,
                'per_page': per_page
            }
            
            response = requests.get(url, headers=self.github_headers, params=params)
            
            if response.status_code != 200:
                error_msg = f"无法获取Release列表: {response.json().get('message', '未知错误')}"
                self.logger.error(f"❌ {error_msg}")
                raise Exception(error_msg)
            
            releases = response.json()
            
            if not releases:
                break
            
            all_releases.extend(releases)
            page += 1
            
            # 显示获取进度
            self.logger.info(f"📄 已获取 {len(all_releases)} 个Release...")
        
        self.logger.info(f"✅ 总共获取到 {len(all_releases)} 个Release")
        
        return all_releases
    
    def _update_github_summary(self, section: str, content: str, status: str = "进行中"):
        """
        更新GitHub Actions摘要
        
        Args:
            section: 章节名称
            content: 内容
            status: 状态 (进行中、完成、失败)
        """
        if not self.step_summary_file:
            return
        
        try:
            # 状态图标映射
            status_icons = {
                "进行中": "⏳",
                "完成": "✅", 
                "失败": "❌",
                "跳过": "⏩",
                "警告": "⚠️"
            }
            
            icon = status_icons.get(status, "ℹ️")
            current_time = datetime.now().strftime('%H:%M:%S')
            
            # 更新或添加章节
            self.summary_sections[section] = {
                "icon": icon,
                "status": status,
                "content": content,
                "time": current_time
            }
            
            # 重新生成完整摘要
            self._regenerate_full_summary()
            
        except Exception as e:
            self.logger.warning(f"⚠️ 更新GitHub摘要失败: {e}")
    
    def _regenerate_full_summary(self):
        """重新生成完整的GitHub Actions摘要"""
        if not self.step_summary_file:
            return
        
        try:
            summary_content = "# 🤖 AI变更日志生成 - 实时状态\n\n"
            
            # 按预定义顺序显示章节
            section_order = [
                "初始化", "参数验证", "获取Release信息", 
                "检查优化状态", "获取提交信息", "提交分类",
                "AI智能分析", "生成变更日志", "更新Release",
                "批量处理进度", "执行完成"
            ]
            
            summary_content += "## 📊 执行进度\n\n"
            
            for section in section_order:
                if section in self.summary_sections:
                    info = self.summary_sections[section]
                    summary_content += f"- {info['icon']} **{section}** ({info['time']}) - {info['status']}\n"
                    if info['content'] and info['status'] in ["完成", "失败", "警告"]:
                        # 为完成、失败或警告状态添加详细信息
                        summary_content += f"  - {info['content']}\n"
            
            # 添加实时统计信息
            if hasattr(self, 'batch_stats') and self.batch_stats.total_releases > 0:
                elapsed_time = time.time() - self.batch_stats.start_time
                progress = (self.batch_stats.processed_releases / self.batch_stats.total_releases) * 100
                
                summary_content += f"\n## 📈 批量处理统计\n\n"
                summary_content += f"| 指标 | 数值 |\n"
                summary_content += f"|------|------|\n"
                summary_content += f"| 总Release数 | {self.batch_stats.total_releases} |\n"
                summary_content += f"| 已处理 | {self.batch_stats.processed_releases} |\n"
                summary_content += f"| 进度 | {progress:.1f}% |\n"
                summary_content += f"| 成功 | {self.batch_stats.success_count} |\n"
                summary_content += f"| AI成功 | {self.batch_stats.ai_success_count} |\n"
                summary_content += f"| 跳过 | {self.batch_stats.skipped_count} |\n"
                summary_content += f"| 失败 | {self.batch_stats.error_count} |\n"
                summary_content += f"| 已用时 | {elapsed_time/60:.1f}分钟 |\n"
            
            summary_content += f"\n---\n*最后更新: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n"
            
            # 写入摘要文件
            with open(self.step_summary_file, 'w', encoding='utf-8') as f:
                f.write(summary_content)
                
        except Exception as e:
            self.logger.warning(f"⚠️ 重新生成摘要失败: {e}")
    
    def print_realtime_summary(self, release_tag: str, current: int, total: int, 
                              success: bool, ai_success: bool, error_msg: Optional[str] = None):
        """
        实时输出处理摘要
        
        Args:
            release_tag: Release标签
            current: 当前处理的序号
            total: 总数
            success: 是否成功
            ai_success: AI是否成功
            error_msg: 错误信息
        """
        elapsed_time = time.time() - self.batch_stats.start_time
        
        # 更新统计
        if success:
            self.batch_stats.success_count += 1
            if ai_success:
                self.batch_stats.ai_success_count += 1
        else:
            self.batch_stats.error_count += 1
        
        # 计算进度和时间估算
        progress = (current / total) * 100
        if current > 0:
            avg_time = elapsed_time / current
            remaining_time = avg_time * (total - current)
            remaining_str = f"{remaining_time/60:.1f}分钟" if remaining_time > 60 else f"{remaining_time:.0f}秒"
        else:
            remaining_str = "计算中..."
        
        # 状态确定
        if success:
            if error_msg == "NO_COMMITS":
                status = "跳过"
                self.batch_stats.skipped_count += 1
                details = [f"⚠️ {release_tag} 无提交记录 - 已跳过"]
            else:
                status = "完成"
                mode_desc = "🧠 AI智能生成" if ai_success else "📝 基础规则生成"
                details = [f"✅ {release_tag} 处理完成 - {mode_desc}"]
        elif error_msg == "SKIPPED":
            status = "跳过"
            self.batch_stats.skipped_count += 1
            details = [f"⏩ {release_tag} 已跳过 - 无需优化"]
        else:
            status = "失败"
            details = [f"❌ {release_tag} 处理失败"]
            if error_msg:
                details.append(f"   错误: {error_msg}")
        
        # 输出实时摘要
        summary_details = [
            f"📦 当前处理: {release_tag}",
            f"📊 进度: {current}/{total} ({progress:.1f}%)",
            "",
            "📈 当前统计:",
            f"  ✅ 成功: {self.batch_stats.success_count}",
            f"  🧠 AI成功: {self.batch_stats.ai_success_count}",
            f"  ❌ 失败: {self.batch_stats.error_count}",
            f"  ⏩ 跳过: {self.batch_stats.skipped_count}",
            "",
            "⏱️ 时间信息:",
            f"  已用时: {elapsed_time/60:.1f}分钟",
            f"  预计剩余: {remaining_str}",
            ""
        ] + details
        
        self._print_step_summary(f"批量处理进度", status, summary_details, (current, total))
        
        # 更新GitHub Actions实时进度
        progress_info = f"{release_tag} - {current}/{total} ({progress:.1f}%)"
        batch_status = "进行中" if current < total else ("完成" if self.batch_stats.error_count == 0 else "警告")
        
        self._update_github_summary("批量处理进度", progress_info, batch_status)
        
        # 刷新输出确保实时显示
        sys.stdout.flush()
    
    def process_single_release(self, release_data: Dict[str, Any]) -> Tuple[bool, bool, Optional[str]]:
        """
        处理单个Release
        
        Args:
            release_data: Release数据
            
        Returns:
            Tuple[是否成功, AI是否成功, 错误信息]
        """
        tag_name = release_data['tag_name']
        release_id = str(release_data['id'])
        original_changelog = release_data.get('body', '')
        
        try:
            # 检查是否需要优化
            need_optimize, processed_changelog = self.check_optimization_status(
                RunMode.MANUAL_OPTIMIZE, original_changelog
            )
            
            if not need_optimize:
                return True, False, "SKIPPED"
            
            # 获取Git提交信息
            commits, commit_range, commit_count = self.get_git_commits(tag_name)
            
            # 如果没有提交记录，跳过处理
            if commit_count == 0:
                self.logger.warning(f"⚠️ 版本 {tag_name} 没有提交记录，跳过处理")
                return True, False, "NO_COMMITS"
            
            self.batch_stats.total_commits += commit_count
            
            # 分类提交
            classified_commits = self.classify_commits(commits)
            
            # 尝试AI分析
            ai_analysis = self.call_deepseek_api(commits)
            ai_success = ai_analysis is not None
            
            # 生成变更日志
            if ai_success:
                changelog = self.generate_changelog_with_ai(tag_name, ai_analysis, processed_changelog, commits)
            else:
                changelog = self.generate_changelog_basic(tag_name, classified_commits, processed_changelog)
            
            # 更新Release
            success = self.update_release_changelog(release_id, changelog)
            
            return success, ai_success, None
            
        except Exception as e:
            self.logger.error(f"❌ 处理版本 {tag_name} 时发生异常: {e}")
            return False, False, str(e)
    
    def run_batch_processing(self) -> bool:
        """
        运行批量处理所有Release
        
        Returns:
            是否整体执行成功
        """
        self.logger.info("🔄 开始批量处理所有Release...")
        
        try:
            # 获取所有Release
            all_releases = self.get_all_releases()
            
            if not all_releases:
                self.logger.warning("⚠️ 未找到任何Release")
                return True
            
            self.batch_stats.total_releases = len(all_releases)
            
            print(f"\n🚀 开始批量处理 {len(all_releases)} 个Release")
            print(f"⏱️ 开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print("="*80)
            
            # 逐个处理Release
            for i, release_data in enumerate(all_releases, 1):
                tag_name = release_data['tag_name']
                
                try:
                    success, ai_success, error_msg = self.process_single_release(release_data)
                    self.print_realtime_summary(tag_name, i, len(all_releases), success, ai_success, error_msg)
                    
                    # 添加适当的延迟，避免API限制
                    if i < len(all_releases):
                        time.sleep(2)
                        
                except Exception as e:
                    self.logger.error(f"❌ 处理 {tag_name} 时发生异常: {e}")
                    self.print_realtime_summary(tag_name, i, len(all_releases), False, False, str(e))
                
                self.batch_stats.processed_releases = i
            
            # 输出最终统计
            self.print_final_batch_summary()
            
            # 输出GitHub Actions变量
            self._output_batch_github_actions()
            
            # 判断整体是否成功（成功率超过80%）
            success_rate = self.batch_stats.success_count / len(all_releases)
            return success_rate >= 0.8
            
        except Exception as e:
            self.logger.error(f"❌ 批量处理失败: {e}")
            return False
    
    def print_final_batch_summary(self):
        """输出最终批量处理摘要"""
        elapsed_time = time.time() - self.batch_stats.start_time
        success_rate = (self.batch_stats.success_count / self.batch_stats.total_releases) * 100
        ai_rate = (self.batch_stats.ai_success_count / max(1, self.batch_stats.success_count)) * 100
        
        print(f"\n{'='*80}")
        print(f"🎉 批量处理完成！")
        print(f"{'='*80}")
        
        print(f"📊 最终统计:")
        print(f"  📦 总Release数: {self.batch_stats.total_releases}")
        print(f"  ✅ 成功处理: {self.batch_stats.success_count}")
        print(f"  🧠 AI成功: {self.batch_stats.ai_success_count}")
        print(f"  ⏩ 跳过: {self.batch_stats.skipped_count}")
        print(f"  ❌ 失败: {self.batch_stats.error_count}")
        print(f"  📝 总提交数: {self.batch_stats.total_commits}")
        
        print(f"📈 成功率:")
        print(f"  📦 处理成功率: {success_rate:.1f}%")
        print(f"  🧠 AI成功率: {ai_rate:.1f}%")
        
        print(f"⏱️  时间统计:")
        print(f"  总用时: {elapsed_time/60:.1f}分钟")
        print(f"  平均每个: {elapsed_time/self.batch_stats.total_releases:.1f}秒")
        print(f"  完成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        print(f"{'='*80}")
    
    def _output_batch_github_actions(self):
        """输出批量处理的GitHub Actions变量"""
        github_output_file = os.getenv('GITHUB_OUTPUT')
        if github_output_file:
            try:
                with open(github_output_file, 'a', encoding='utf-8') as f:
                    f.write(f"ai_success={self.batch_stats.ai_success_count > 0}\n")
                    f.write(f"total_commits={self.batch_stats.total_commits}\n")
                    f.write(f"generation_mode=batch\n")
                    f.write(f"processed_releases={self.batch_stats.processed_releases}\n")
            except Exception as e:
                self.logger.warning(f"⚠️ 设置GitHub Actions输出变量失败: {e}")
        
        # GitHub Actions Step Summary
        step_summary_file = os.getenv('GITHUB_STEP_SUMMARY')
        if step_summary_file:
            try:
                elapsed_time = time.time() - self.batch_stats.start_time
                success_rate = (self.batch_stats.success_count / self.batch_stats.total_releases) * 100
                
                summary_content = f"""# 🔄 批量AI变更日志生成报告

## 📊 处理统计
- **总Release数**: `{self.batch_stats.total_releases}`
- **成功处理**: `{self.batch_stats.success_count}`
- **AI智能生成**: `{self.batch_stats.ai_success_count}`
- **跳过**: `{self.batch_stats.skipped_count}`
- **失败**: `{self.batch_stats.error_count}`

## 📈 性能指标
- **处理成功率**: `{success_rate:.1f}%`
- **总处理时间**: `{elapsed_time/60:.1f}分钟`
- **总提交数**: `{self.batch_stats.total_commits}`

## ✅ 执行结果
{'✅ 批量处理成功完成' if success_rate >= 80 else '⚠️ 批量处理部分失败'}
"""
                
                with open(step_summary_file, 'w', encoding='utf-8') as f:
                    f.write(summary_content)
                
            except Exception as e:
                self.logger.warning(f"⚠️ 生成GitHub Actions摘要失败: {e}")

    def run(self, version: Optional[str] = None, release_id: Optional[str] = None, 
           tag: Optional[str] = None, target: Optional[str] = None,
           event_name: str = "workflow_dispatch") -> bool:
        """
        运行AI变更日志生成流程
        
        Args:
            version: 版本号 (自动触发时使用)
            release_id: Release ID (自动触发时使用)
            tag: 标签 (旧版兼容)
            target: 目标版本或标签 (新版手动触发使用)
            event_name: 事件名称
            
        Returns:
            是否执行成功
        """
        self._print_step_summary("开始执行", "进行中", [
            f"仓库: {self.repo}",
            f"事件类型: {event_name}",
            "正在初始化..."
        ])
        
        # 初始化摘要
        self._update_github_summary("初始化", f"仓库: {self.repo}, 事件: {event_name}", "完成")
        
        try:
            # 1. 验证参数
            self._update_github_summary("参数验证", "正在验证输入参数...", "进行中")
            mode, final_version, final_release_id = self.validate_params(
                version, release_id, tag, target, event_name
            )
            self._update_github_summary("参数验证", f"模式: {mode.value}, 版本: {final_version}", "完成")
            
            # 2. 批量处理模式
            if mode == RunMode.BATCH_ALL:
                self._update_github_summary("批量处理进度", "开始批量处理所有Release", "进行中")
                result = self.run_batch_processing()
                final_status = "完成" if result else "失败"
                self._update_github_summary("执行完成", f"批量处理{final_status}", final_status)
                return result
            
            # 3. 单个Release处理模式
            # 获取Release信息
            self._update_github_summary("获取Release信息", f"版本: {final_version}", "进行中")
            final_release_id, original_changelog = self.get_release_info(mode, final_version, final_release_id)
            self._update_github_summary("获取Release信息", f"Release ID: {final_release_id}", "完成")
            
            # 检查是否需要优化
            self._update_github_summary("检查优化状态", "分析变更日志状态...", "进行中")
            need_optimize, processed_changelog = self.check_optimization_status(mode, original_changelog)
            
            if not need_optimize:
                self._update_github_summary("检查优化状态", "无需优化", "跳过")
                self._update_github_summary("执行完成", "流程跳过", "跳过")
                return True
            else:
                self._update_github_summary("检查优化状态", "需要优化", "完成")
            
            # 获取Git提交信息
            self._update_github_summary("获取提交信息", f"版本: {final_version}", "进行中")
            commits, commit_range, commit_count = self.get_git_commits(final_version)
            self._update_github_summary("获取提交信息", f"获取到 {commit_count} 个提交", "完成")
            
            # 分类提交
            self._update_github_summary("提交分类", f"分类 {commit_count} 个提交", "进行中")
            classified_commits = self.classify_commits(commits)
            self._update_github_summary("提交分类", "提交分类完成", "完成")
            
            # 尝试AI分析
            self._update_github_summary("AI智能分析", "调用DeepSeek API...", "进行中")
            ai_analysis = self.call_deepseek_api(commits)
            ai_success = ai_analysis is not None
            ai_error = None if ai_success else "API调用失败"
            
            if ai_success:
                self._update_github_summary("AI智能分析", "AI分析成功", "完成")
            else:
                self._update_github_summary("AI智能分析", "AI调用失败，使用基础规则", "警告")
            
            # 生成变更日志
            self._update_github_summary("生成变更日志", "正在生成变更日志...", "进行中")
            if ai_success:
                changelog = self.generate_changelog_with_ai(final_version, ai_analysis, processed_changelog, commits)
            else:
                changelog = self.generate_changelog_basic(final_version, classified_commits, processed_changelog)
            self._update_github_summary("生成变更日志", f"变更日志生成完成 ({len(changelog)} 字符)", "完成")
            
            # 更新Release
            self._update_github_summary("更新Release", f"更新Release {final_release_id}...", "进行中")
            success = self.update_release_changelog(final_release_id, changelog)
            
            if success:
                self._update_github_summary("更新Release", "Release更新成功", "完成")
                self._update_github_summary("执行完成", f"变更日志生成成功 ({'AI智能' if ai_success else '基础规则'})", "完成")
            else:
                self._update_github_summary("更新Release", "Release更新失败", "失败")
                self._update_github_summary("执行完成", "执行失败", "失败")
            
            # 最终摘要
            if success:
                final_details = [
                    f"✅ {final_version} 变更日志生成成功",
                    f"🎯 生成方式: {'🧠 AI智能生成' if ai_success else '📝 基础规则生成'}",
                    f"📊 处理提交: {commit_count} 个",
                    f"⏰ 执行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
                ]
                
                if not ai_success and ai_error:
                    final_details.append(f"⚠️ AI调用失败: {ai_error}")
                
                self._print_step_summary("执行完成", "完成", final_details)
            else:
                self._print_step_summary("执行完成", "失败", ["❌ Release更新失败"])
            
            # 生成和输出摘要报告
            report = self.generate_summary_report(mode, final_version, final_release_id, 
                                                 classified_commits, ai_success, ai_error)
            
            # 输出到控制台
            print(report)
            
            # 输出到GitHub Actions
            self.output_github_actions_summary(mode, final_version, final_release_id, 
                                             classified_commits, ai_success, ai_error)
            
            return success
            
        except Exception as e:
            self._update_github_summary("执行完成", f"执行异常: {str(e)[:100]}", "失败")
            return False


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description="AI变更日志生成器")
    
    # 新版参数
    parser.add_argument("--target", help="目标版本或标签（手动触发使用，如：v1.0.0 或 latest）")
    
    # 兼容旧版参数
    parser.add_argument("--version", help="版本号（自动触发使用）")
    parser.add_argument("--release-id", help="Release ID（自动触发使用）")
    parser.add_argument("--tag", help="标签（旧版兼容）")
    
    # 其他参数
    parser.add_argument("--event-name", default="workflow_dispatch", help="事件名称")
    parser.add_argument("--repo", help="GitHub仓库名(owner/repo)")
    parser.add_argument("--github-token", help="GitHub Token")
    parser.add_argument("--deepseek-api-key", help="DeepSeek API Key")
    
    args = parser.parse_args()
    
    # 从环境变量获取配置
    github_token = args.github_token or os.getenv("GITHUB_TOKEN")
    deepseek_api_key = args.deepseek_api_key or os.getenv("DEEPSEEK_API_KEY")
    repo = args.repo or os.getenv("GITHUB_REPOSITORY")
    
    if not github_token:
        print("❌ 缺少GitHub Token，请设置GITHUB_TOKEN环境变量或使用--github-token参数")
        sys.exit(1)
    
    if not deepseek_api_key:
        print("❌ 缺少DeepSeek API Key，请设置DEEPSEEK_API_KEY环境变量或使用--deepseek-api-key参数")
        sys.exit(1)
    
    if not repo:
        print("❌ 缺少仓库信息，请设置GITHUB_REPOSITORY环境变量或使用--repo参数")
        sys.exit(1)
    
    # 创建生成器并运行
    generator = AIChangelogGenerator(github_token, deepseek_api_key, repo)
    
    success = generator.run(
        version=args.version,
        release_id=args.release_id,
        tag=args.tag,
        target=args.target,
        event_name=args.event_name
    )
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
