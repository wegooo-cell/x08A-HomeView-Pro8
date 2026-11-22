package dev.pro8.homeview.direct;

/** Short HOME requests from the existing PMIC mapping toggle only while already in HomeView. */
final class DesktopSwitchPolicy {
    static boolean openNative(boolean homeRequest,boolean explicitReturn,boolean wasVisible,boolean awake,long sinceScreenChange,long sinceSwitch){
        return homeRequest&&!explicitReturn&&wasVisible&&awake&&sinceScreenChange>=650&&sinceSwitch>=350;
    }
}
