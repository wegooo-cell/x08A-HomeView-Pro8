package dev.pro8.homeview.direct;
/** Fixed legacy entry point. Contains no account, browser, provider or stored configuration. */
public final class HomeActivity extends android.app.Activity {
 public void onCreate(android.os.Bundle state){super.onCreate(state);try{startActivity(new android.content.Intent(android.content.Intent.ACTION_MAIN).addCategory(android.content.Intent.CATEGORY_HOME).setClassName("io.github.wegooo_cell.homeview","dev.pro8.homeview.direct.HomeActivity").putExtra("homeview_return",true).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK|android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP|android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP));}catch(android.content.ActivityNotFoundException e){android.widget.Toast.makeText(this,"请先安装 x08A HomeView Pro8",android.widget.Toast.LENGTH_LONG).show();}finish();}
}
