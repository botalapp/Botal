#!/usr/bin/env python3
import http.server
import socketserver
import json
import urllib.request
import urllib.parse
import ssl
import os
from http.server import SimpleHTTPRequestHandler
import threading
import sys
import requests

class CustomHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/api/asr':
            self.handle_asr_request()
        else:
            self.send_error(404)
    
    def do_GET(self):
        # 处理静态文件请求
        if self.path == '/':
            self.path = '/index.html'
        return super().do_GET()
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()
    
    def handle_asr_request(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            # 阿里云ASR API配置
            appkey = 'cFN6egU9mqIrijcV'
            token = 'be0c529d53b94aed9803edc01dedf16c'
            
            # 构建阿里云API URL
            params = {
                'appkey': appkey,
                'format': 'pcm',
                'sample_rate': '16000',
                'enable_punctuation_prediction': 'true',
                'enable_inverse_text_normalization': 'true'
            }
            
            url = f"https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/asr?{urllib.parse.urlencode(params)}"
            
            # 创建请求
            req = urllib.request.Request(url)
            req.add_header('X-NLS-Token', token)
            req.add_header('Content-Type', 'application/octet-stream')
            req.add_header('Content-Length', str(len(post_data)))
            
            # 发送请求到阿里云
            response = urllib.request.urlopen(req, post_data)
            result = response.read().decode('utf-8')
            
            # 解析阿里云ASR结果
            asr_result = json.loads(result)
            
            # 如果识别成功，调用DeepSeek API进行内容整理
            if asr_result.get('status') == 20000000 and asr_result.get('result'):
                processed_text = self.process_with_deepseek(asr_result['result'])
                asr_result['processed_result'] = processed_text
            
            # 返回结果给前端
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(asr_result).encode('utf-8'))
            
        except urllib.error.HTTPError as e:
            error_response = {
                "task_id": "",
                "result": "",
                "status": e.code,
                "message": e.reason
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(error_response).encode('utf-8'))
            
        except Exception as e:
            error_response = {
                "task_id": "",
                "result": "",
                "status": 500,
                "message": str(e)
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(error_response).encode('utf-8'))
    
    def process_with_deepseek(self, text):
        """调用DeepSeek API进行内容整理"""
        try:
            # DeepSeek API配置
            api_key = 'sk-897669e28c2f487a87671f04c049e3f9'
            api_url = 'https://api.deepseek.com/v1/chat/completions'
            
            # 构建请求数据
            payload = {
                "model": "deepseek-chat",
                "messages": [
                    {
                        "role": "system",
                        "content": "你是一个专业的笔记整理助手。请将语音转文字的结果进行以下处理：1. 去除口头语（如'嗯''那个''然后'等）；2. 修正明显错误；3. 删除重复内容；4. 整理为通顺的笔记格式。直接返回整理后的内容，不要添加任何解释。"
                    },
                    {
                        "role": "user", 
                        "content": text
                    }
                ],
                "stream": False
            }
            
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            
            # 发送请求到DeepSeek API
            response = requests.post(api_url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            
            result = response.json()
            return result['choices'][0]['message']['content']
            
        except Exception as e:
            print(f"DeepSeek API调用失败: {e}")
            return text  # 如果失败，返回原始文本

if __name__ == '__main__':
    PORT = 8003
    
    try:
        with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
            print(f"Server running at http://localhost:{PORT}")
            print("Press Ctrl+C to stop the server")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        sys.exit(0)