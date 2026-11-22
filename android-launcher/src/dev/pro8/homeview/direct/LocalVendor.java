package dev.pro8.homeview.direct;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;

/** Fixed-package management only; no route accepts package names or commands. */
final class LocalVendor {
    static final String PACKAGE = "com.xiaomi.micolauncher";
    private final Context context;
    private final DevicePolicyManager policy;
    private final ComponentName admin;

    LocalVendor(Context context) {
        this.context = context.getApplicationContext();
        policy = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
        admin = new ComponentName(context, HomeViewAdmin.class);
    }

    boolean available() {
        return policy != null && policy.isDeviceOwnerApp(context.getPackageName());
    }

    void hidden(boolean hide) {
        if (!available()) throw new IllegalStateException("尚未授权本机设备管理");
        if (policy.isApplicationHidden(admin, PACKAGE) == hide) return;
        if (!policy.setApplicationHidden(admin, PACKAGE, hide))
            throw new IllegalStateException("系统未允许切换小爱桌面");
    }

    void release() {
        if (!available()) return;
        hidden(false);
        policy.clearDeviceOwnerApp(context.getPackageName());
        if (policy.isAdminActive(admin)) policy.removeActiveAdmin(admin);
    }
}
