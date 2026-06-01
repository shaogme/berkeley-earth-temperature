use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::thread;

fn main() {
    println!("🔍 正在寻找可用的本地端口进行绑定...");

    let mut port = 8080;
    let listener = loop {
        match TcpListener::bind(format!("127.0.0.1:{}", port)) {
            Ok(l) => break l,
            Err(_) => {
                println!("⚠️ 端口 {} 已被占用，正在尝试端口 {}...", port, port + 1);
                port += 1;
                if port > 65535 {
                    eprintln!("❌ 错误：未找到任何可用的 TCP 端口！");
                    std::process::exit(1);
                }
            }
        }
    };

    println!("\n=======================================================");
    println!("本地 Web 服务器已成功启动！");
    println!("提示：静态资源根目录已映射至地图项目主目录 (parent)。");
    println!("请在现代浏览器中打开链接查看人口气泡地图：");
    println!("   http://127.0.0.1:{}", port);
    println!("   http://localhost:{}", port);
    println!("提示：在当前终端按下 Ctrl + C 即可退出服务器。");
    println!("=======================================================\n");

    // 并发处理 TCP 接入，使用轻量线程分发
    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                thread::spawn(move || {
                    if let Err(e) = handle_connection(s) {
                        eprintln!("⚠️ 处理请求连接时发生错误: {:?}", e);
                    }
                });
            }
            Err(e) => {
                eprintln!("⚠️ 接收 TCP 连接失败: {:?}", e);
            }
        }
    }
}

/**
 * 核心 TCP 静态请求处理器
 */
fn handle_connection(mut stream: TcpStream) -> std::io::Result<()> {
    let mut reader = BufReader::new(&mut stream);
    let mut request_line = String::new();

    // 读取第一行请求行 (如: GET /js/app.js HTTP/1.1)
    if reader.read_line(&mut request_line)? == 0 {
        return Ok(());
    }

    // 粗略解析 HTTP 方法和 URL 路径描述
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return send_400(&mut stream);
    }

    let method = parts[0];
    let mut raw_path = parts[1];

    // 本服务器仅接收 GET 静态资源请求
    if method != "GET" {
        return send_405(&mut stream);
    }

    // 剔除 URL 中的 query string 变量 (如: /js/app.js?v=1.2 -> /js/app.js)
    if let Some(q_idx) = raw_path.find('?') {
        raw_path = &raw_path[..q_idx];
    }

    // 十六进制百分号 URL 解码，防止工作区包含中文或特殊字符时出现 404
    let decoded_path = decode_percent(raw_path);

    // 标准化路径，若访问根目录则重定向回默认 index.html
    let normalized_path = if decoded_path == "/" || decoded_path.is_empty() {
        "index.html"
    } else {
        // 移去开头的 '/'
        decoded_path.trim_start_matches('/')
    };

    // 静态资源文件根目录设为当前目录
    let mut target_file = PathBuf::from(".");
    target_file.push(normalized_path);

    // 检查并防范目录穿越漏洞，确认请求目标文件确实存在于当前目录内
    if !is_path_safe(&target_file) {
        return send_403(&mut stream);
    }

    if target_file.exists() && target_file.is_file() {
        send_file(&mut stream, &target_file)
    } else {
        send_404(&mut stream, normalized_path)
    }
}

/**
 * 精确发送静态文件
 */
fn send_file(stream: &mut TcpStream, file_path: &Path) -> std::io::Result<()> {
    let mut file = File::open(file_path)?;
    let mut file_content = Vec::new();
    file.read_to_end(&mut file_content)?;

    let content_type = get_mime_type(file_path);

    // 编写正统的 HTTP/1.1 报头描述，包括精确的内容长度、跨域头以支持 ESM 原生拉取
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Length: {}\r\n\
         Content-Type: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Connection: close\r\n\r\n",
        file_content.len(),
        content_type
    );

    stream.write_all(header.as_bytes())?;
    stream.write_all(&file_content)?;
    stream.flush()?;
    Ok(())
}

/**
 * 依据后缀判定 MIME 内容类型
 * 特别关键：现代浏览器对于 ES Modules 导入的脚本，必须校验 Content-Type: application/javascript，否则拒绝加载！
 */
fn get_mime_type(file_path: &Path) -> &'static str {
    match file_path.extension().and_then(|ext| ext.to_str()) {
        Some("html") | Some("htm") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "application/javascript; charset=utf-8", // 原生 ESM 所必须
        Some("json") => "application/json; charset=utf-8",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/**
 * 百分号 URL 解码逻辑 (Zero-Dependency 实现)
 */
fn decode_percent(path: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = path.as_bytes().iter();
    while let Some(&b) = chars.next() {
        if b == b'%' {
            if let (Some(&h), Some(&l)) = (chars.next(), chars.next()) {
                if let Some(val) = parse_hex_pair(h, l) {
                    bytes.push(val);
                    continue;
                }
            }
        }
        bytes.push(b);
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn parse_hex_pair(h: u8, l: u8) -> Option<u8> {
    let hex = vec![h, l];
    if let Ok(s) = std::str::from_utf8(&hex) {
        u8::from_str_radix(s, 16).ok()
    } else {
        None
    }
}

/**
 * 路径沙盒检查，规避目录穿越攻击 (防范读取系统隐私文件)
 */
fn is_path_safe(path: &Path) -> bool {
    if let Ok(absolute) = std::fs::canonicalize(path) {
        // 父级根目录绝对路径
        if let Ok(root_abs) = std::fs::canonicalize("..") {
            return absolute.starts_with(root_abs);
        }
    }
    // 若未能 canonicalize（可能是文件暂未创建），粗略检查是否包含 ".." 越界
    let components = path.components();
    let mut depth = 0;
    for comp in components {
        match comp {
            std::path::Component::ParentDir => {
                depth -= 1;
                if depth < -1 {
                    // 允许向上最多一级 (因为根在 "..")
                    return false;
                }
            }
            std::path::Component::Normal(_) => {
                depth += 1;
            }
            _ => {}
        }
    }
    true
}

fn send_404(stream: &mut TcpStream, path: &str) -> std::io::Result<()> {
    let body = format!(
        "<!DOCTYPE html><html><head><title>404 Not Found</title></head>\
         <body style=\"font-family:sans-serif; text-align:center; padding: 40px;\">\
         <h1 style=\"color:#ef4444;\">⚠️ 404 Not Found</h1>\
         <p>静态文件资源 <code>{}</code> 在当前工作区地图目录内未找到。</p>\
         <hr/><small>Rust Local HTTP Server</small></body></html>",
        path
    );
    let resp = format!(
        "HTTP/1.1 404 Not Found\r\n\
         Content-Length: {}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Connection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream.write_all(resp.as_bytes())?;
    stream.flush()?;
    Ok(())
}

fn send_403(stream: &mut TcpStream) -> std::io::Result<()> {
    let body = "<h1>403 Forbidden</h1><p>拒绝访问：严禁跨目录越权访问敏感资源！</p>";
    let resp = format!(
        "HTTP/1.1 403 Forbidden\r\n\
         Content-Length: {}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Connection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream.write_all(resp.as_bytes())?;
    stream.flush()?;
    Ok(())
}

fn send_405(stream: &mut TcpStream) -> std::io::Result<()> {
    let body = "<h1>405 Method Not Allowed</h1><p>仅支持 GET 请求。</p>";
    let resp = format!(
        "HTTP/1.1 405 Method Not Allowed\r\n\
         Content-Length: {}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Connection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream.write_all(resp.as_bytes())?;
    stream.flush()?;
    Ok(())
}

fn send_400(stream: &mut TcpStream) -> std::io::Result<()> {
    let body = "<h1>400 Bad Request</h1><p>非法的 HTTP 请求格式。</p>";
    let resp = format!(
        "HTTP/1.1 400 Bad Request\r\n\
         Content-Length: {}\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Connection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream.write_all(resp.as_bytes())?;
    stream.flush()?;
    Ok(())
}
