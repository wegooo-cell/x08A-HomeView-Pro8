package dev.pro8.homeview.direct;
/** The built-in service consumes the CURRENT state and performs the toggle itself. */
final class MijiaSwitch {
 static boolean target(boolean current,String action,String mode){
  if("toggle".equals(action))return !current;
  if("turn_on".equals(action))return true;
  if("turn_off".equals(action))return false;
  if("set_hvac_mode".equals(action)){if("on".equals(mode))return true;if("off".equals(mode))return false;}
  throw new IllegalArgumentException("请在内置米家中进行这项调节");
 }
 static int wireCurrent(boolean current){return current?1:0;}
}
