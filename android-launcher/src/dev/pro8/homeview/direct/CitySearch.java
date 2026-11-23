package dev.pro8.homeview.direct;

import java.io.*;
import java.text.Normalizer;
import java.util.*;

/** Shared province aliases and city-first query planning; no Android dependencies. */
final class CitySearch {
    static final class Query {
        final String name,country;
        Query(String name,String country){this.name=name;this.country=country;}
    }
    private final List<String[]> provinces=new ArrayList<>();
    CitySearch(){}
    CitySearch(InputStream input)throws IOException{
        try(BufferedReader reader=new BufferedReader(new InputStreamReader(input,"UTF-8"))){
            String line;while((line=reader.readLine())!=null){
                if(line.isEmpty()||line.startsWith("#"))continue;
                String[] row=line.split("\t");
                if(row.length!=5)throw new IOException("Invalid province search rules");
                provinces.add(row);
            }
        }
    }
    List<Query> plans(String input){
        String q=Normalizer.normalize(input,Normalizer.Form.NFKC).trim();String[] region=null;
        outer:for(String[] row:provinces){
            if(row[4].equals("1")&&q.equals(row[1]+"市"))return cityPlans(q);
            List<String> aliases=new ArrayList<>();aliases.add(row[0]);aliases.addAll(Arrays.asList(row[1].split("\\|")));
            for(String alias:aliases){
                if(q.equals(alias)){
                    if(row[4].equals("1")&&(!alias.equals(row[0])||row[0].endsWith("市")))return cityPlans(row[0].endsWith("市")?row[0]:alias+"市");
                    throw new IllegalArgumentException("请填写具体城市，例如："+row[0]+row[3]);
                }
                if(q.startsWith(alias)){
                    String rest=q.substring(alias.length()).replaceFirst("^[ ·,，]+","");
                    if(rest.length()>=2){region=row;q=rest;break outer;}
                }
            }
        }
        String suffix=region==null?"":", "+region[2],country=region==null?"":"CN";
        List<Query> plans=new ArrayList<>();
        if(q.matches("[\u3400-\u9fff]{2,12}")&&!q.matches(".*(?:市|县|区|镇|乡|旗|盟|州|街道)$"))plans.add(new Query(q+"市"+suffix,country));
        plans.add(new Query(q+suffix,country));if(q.matches("[\u3400-\u9fff]{2,12}市"))plans.add(new Query(q.substring(0,q.length()-1)+suffix,country));return plans;
    }
    private static List<Query> cityPlans(String city){return Arrays.asList(new Query(city,"CN"),new Query(city.substring(0,city.length()-1),"CN"));}
    static boolean acceptName(String query,String name){String target=query.split(",")[0];return !target.matches("[\u3400-\u9fff]{2,12}市")||name.equals(target)||name.equals(target.substring(0,target.length()-1));}
    String admin(String value,String country){
        if(country.equals("CN"))for(String[] row:provinces){
            if(value.equals(row[0])||Arrays.asList(row[1].split("\\|")).contains(value))return row[0];
        }
        return value;
    }
    static int rank(String code){
        switch(code){case "PPLC":return 0;case "PPLA":return 1;case "PPLA2":return 2;case "PPLA3":return 3;case "PPL":return 4;case "PPLX":return 5;case "PPLA4":return 6;default:return 99;}
    }
}
