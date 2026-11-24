package in.rxmunshi.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * RxMunshi for Android: the offline web app, bundled in assets/web and served
 * from a private https origin so browser storage and secure-context APIs work.
 * WhatsApp and other external links open in their own apps.
 */
public class MainActivity extends Activity {
    static final String HOST = "app.rxmunshi.invalid";
    static final String ORIGIN = "https://" + HOST;
    static final int REQ_FILE = 1;
    static final int REQ_SAVE = 2;
    static final int REQ_PERM = 3;

    static final Map<String, String> TYPES = new HashMap<>();
    static {
        TYPES.put("html", "text/html");
        TYPES.put("js", "text/javascript");
        TYPES.put("css", "text/css");
        TYPES.put("json", "application/json");
        TYPES.put("txt", "text/plain");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("png", "image/png");
        TYPES.put("ico", "image/x-icon");
        TYPES.put("woff2", "font/woff2");
        TYPES.put("woff", "font/woff");
    }

    WebView web;
    ValueCallback<Uri[]> fileCallback;
    PermissionRequest pendingPermission;
    byte[] pendingSave;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#eceae6"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false); // window.open('/phone/') opens in place; Back returns
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Bridge(), "RxNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                return serve(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri u = Uri.parse(url);
                if (HOST.equals(u.getHost())) return false;
                openExternal(u);
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    public void run() {
                        List<String> need = new ArrayList<>();
                        for (String r : request.getResources()) {
                            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && !granted(Manifest.permission.CAMERA)) need.add(Manifest.permission.CAMERA);
                            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && !granted(Manifest.permission.RECORD_AUDIO)) need.add(Manifest.permission.RECORD_AUDIO);
                        }
                        if (need.isEmpty()) {
                            request.grant(request.getResources());
                        } else if (Build.VERSION.SDK_INT >= 23) {
                            pendingPermission = request;
                            requestPermissions(need.toArray(new String[0]), REQ_PERM);
                        } else {
                            request.deny();
                        }
                    }
                });
            }
        });

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(ORIGIN + "/today/");
    }

    boolean granted(String perm) {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED;
    }

    /** Serves a file from assets/web: /today/ → today/index.html, unknown → 404.html. */
    WebResourceResponse serve(String path) {
        if (path == null || path.isEmpty()) path = "/";
        if (path.contains("..")) path = "/404.html";
        String p = path.startsWith("/") ? path.substring(1) : path;
        String[] tries = p.isEmpty() || p.endsWith("/")
                ? new String[] { p + "index.html" }
                : new String[] { p, p + "/index.html", p + ".html" };
        for (String t : tries) {
            try {
                InputStream in = getAssets().open("web/" + t);
                String ext = t.substring(t.lastIndexOf('.') + 1).toLowerCase();
                String mime = TYPES.containsKey(ext) ? TYPES.get(ext) : "application/octet-stream";
                WebResourceResponse r = new WebResourceResponse(mime, "UTF-8", in);
                Map<String, String> h = new HashMap<>();
                h.put("Cache-Control", t.startsWith("_next/static/") ? "max-age=31536000, immutable" : "no-cache");
                r.setResponseHeaders(h);
                return r;
            } catch (IOException ignored) {
                // try the next candidate
            }
        }
        try {
            WebResourceResponse r = new WebResourceResponse("text/html", "UTF-8", getAssets().open("web/404.html"));
            r.setStatusCodeAndReasonPhrase(404, "Not Found");
            return r;
        } catch (IOException e) {
            return null;
        }
    }

    void openExternal(Uri u) {
        String scheme = u.getScheme() == null ? "" : u.getScheme();
        if (!scheme.equals("https") && !scheme.equals("http") && !scheme.equals("whatsapp") && !scheme.equals("mailto") && !scheme.equals("tel")) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
    }

    /** Called from the web app's download() helper: PDFs, CSVs, JSON exports. */
    class Bridge {
        @JavascriptInterface
        public void saveFile(final String name, final String base64, final String mime) {
            final byte[] bytes;
            try {
                bytes = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                return;
            }
            runOnUiThread(new Runnable() {
                public void run() {
                    pendingSave = bytes;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime.split(";")[0]);
                    i.putExtra(Intent.EXTRA_TITLE, name == null ? "rxmunshi-file" : name.replaceAll("[\\\\/:*?\"<>|]", "_"));
                    try {
                        startActivityForResult(i, REQ_SAVE);
                    } catch (ActivityNotFoundException e) {
                        pendingSave = null;
                        Toast.makeText(MainActivity.this, "Saving files is not supported on this phone", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        if (requestCode == REQ_SAVE) {
            byte[] bytes = pendingSave;
            pendingSave = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out != null) out.write(bytes);
                Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
            } catch (IOException e) {
                Toast.makeText(this, "Could not save the file", Toast.LENGTH_LONG).show();
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQ_PERM && pendingPermission != null) {
            boolean ok = true;
            for (int r : results) ok &= r == PackageManager.PERMISSION_GRANTED;
            if (ok) pendingPermission.grant(pendingPermission.getResources());
            else pendingPermission.deny();
            pendingPermission = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}
