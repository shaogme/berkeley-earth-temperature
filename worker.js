export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 预检 OPTIONS 请求直接返回 204 并允许跨域
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        }
      });
    }

    let targetUrl = "";

    // 映射 1: countries-land
    if (pathname.startsWith("/countries-land/") && pathname.endsWith(".geo.json")) {
      const fileName = pathname.substring(pathname.lastIndexOf("/") + 1);
      targetUrl = `https://github.com/shaogme/berkeley-earth-temperature/releases/download/countries-land/${fileName}`;
    }
    // 映射 2: Global_TAVG_Gridded
    else if (pathname.startsWith("/Global_TAVG_Gridded/") && pathname.endsWith(".nc")) {
      const fileName = pathname.substring(pathname.lastIndexOf("/") + 1);
      targetUrl = `https://github.com/shaogme/berkeley-earth-temperature/releases/download/Global_TAVG_Gridded/${fileName}`;
    }

    // 若非允许的路径，直接拒绝
    if (!targetUrl) {
      return new Response("Forbidden: Path not allowed", { status: 403 });
    }

    try {
      // 代理请求，修改 Host 并去除 Origin 防盗链拦截
      const headers = new Headers(request.headers);
      headers.set("Host", "github.com");
      headers.delete("Origin");

      const response = await fetch(targetUrl, {
        method: "GET",
        headers: headers,
        redirect: "follow" // 自动跟随 GitHub 的重定向 (如 LFS)
      });

      // 组装跨域友好响应头
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      newHeaders.set("Access-Control-Allow-Headers", "*");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    } catch (e) {
      return new Response(`Proxy Error: ${e.message}`, { status: 500 });
    }
  }
};
