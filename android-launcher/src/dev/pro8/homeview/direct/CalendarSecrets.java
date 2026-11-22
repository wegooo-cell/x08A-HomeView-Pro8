package dev.pro8.homeview.direct;

interface CalendarSecrets {
    DavCalendar.Credentials read()throws Exception;
    void save(DavCalendar.Credentials value)throws Exception;
    void clear()throws Exception;
}
