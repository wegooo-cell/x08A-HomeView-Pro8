import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from installer import core, geocoding
from installer.config import PRESETS, ConfigError, normalize

ROOT = Path(__file__).resolve().parents[1]


def place(name='长春市', **extra):
    return dict(name=name, latitude=43.88, longitude=125.32278,
                timezone='Asia/Shanghai', country='中国', country_code='CN',
                admin1='吉林', admin2='长春市', feature_code='PPLA', **extra)


class CitySearch(unittest.TestCase):
    def test_short_name_uses_city_coordinates_without_homonym_query(self):
        with patch('installer.core.request_json', return_value={'results': [place()]}) as fetch:
            result = core.search_cities('长春')
        self.assertEqual(parse_qs(urlsplit(fetch.call_args.args[0]).query)['name'], ['长春市'])
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual((result[0]['admin1'], result[0]['name'], result[0]['latitude'], result[0]['longitude']),
                         ('吉林省', '长春市', 43.88, 125.32278))
        self.assertEqual(normalize({'weather': result[0]})['weather'], result[0])

    def test_qualified_and_unqualified_names(self):
        cases = {'长春': [('长春市', ''), ('长春', '')],
                 '长春市': [('长春市', ''), ('长春', '')],
                 '吉林省长春市': [('长春市, Jilin', 'CN'), ('长春, Jilin', 'CN')],
                 '吉林长春': [('长春市, Jilin', 'CN'), ('长春, Jilin', 'CN')],
                 '吉林市': [('吉林市', 'CN'), ('吉林', 'CN')], '吉林': [('吉林市', 'CN'), ('吉林', 'CN')],
                 '北京': [('北京市', 'CN'), ('北京', 'CN')], '北京市': [('北京市', 'CN'), ('北京', 'CN')],
                 '延边州': [('延边州', '')], 'Changchun': [('Changchun', '')]}
        for query, expected in cases.items():
            with self.subTest(query=query):
                self.assertEqual(geocoding.plans(query), expected)

    def test_province_alone_cannot_select_homonym_village(self):
        for query in ('福建', '福建省', '吉林省', '广西', '内蒙古'):
            with self.subTest(query=query), patch('installer.core.request_json') as fetch:
                with self.assertRaisesRegex(ConfigError, '具体城市'):
                    core.search_cities(query)
                fetch.assert_not_called()

    def test_fallback_filters_parks_and_ranks_places(self):
        village = place('同名镇'); village.update(feature_code='PPLA4', admin1='黑龙江')
        park = place('长春市南湖公园'); park['feature_code'] = 'PRK'
        with patch('installer.core.request_json', side_effect=[{'results': [park]}, {'results': [village, place(), place()]}]) as fetch:
            result = core.search_cities('长春')
        self.assertEqual(fetch.call_count, 2)
        self.assertEqual([r['name'] for r in result], ['长春市', '同名镇'])
        self.assertEqual(result[1]['admin1'], '黑龙江省')

    def test_city_suffix_cannot_match_longer_village_name(self):
        false_match = place('上海市场社区'); false_match.update(feature_code='PPL', admin1='河南')
        shanghai = place('上海'); shanghai.update(admin1='上海', admin2='上海市', latitude=31.22222, longitude=121.45806)
        with patch('installer.core.request_json', side_effect=[{'results': [false_match]}, {'results': [shanghai]}]):
            result = core.search_cities('上海')
        self.assertEqual((result[0]['name'], result[0]['admin1']), ('上海', '上海市'))

    def test_bad_coordinates_are_not_accepted(self):
        bad = place(); bad['latitude'] = float('nan')
        with patch('installer.core.request_json', return_value={'results': [bad]}):
            self.assertEqual(core.search_cities('长春市'), [])

    def test_presets_have_provinces(self):
        self.assertEqual(next(c for c in PRESETS if c['name'] == '广州')['admin1'], '广东省')

    @unittest.skipUnless(shutil.which('javac') and shutil.which('java'), 'JDK not available')
    def test_android_query_rules_match_desktop(self):
        # Test the Android helper on the JVM against the same shared rule file.
        harness = '''package dev.pro8.homeview.direct;
import java.io.*;
public class CitySearchCheck {
 public static void main(String[] args) throws Exception {
  CitySearch search=new CitySearch(new FileInputStream(args[0]));
  for(int i=1;i<args.length;i++) {
   try {for(CitySearch.Query p:search.plans(args[i]))System.out.println(p.name+"\\t"+p.country);}
   catch(IllegalArgumentException e){System.out.println("ERROR");}
   System.out.println("END");
  }
 }
}'''
        java_home = Path(os.environ.get('JAVA_HOME', ''))
        suffix = '.exe' if os.name == 'nt' else ''
        javac = str(java_home/('bin/javac'+suffix)) if (java_home/('bin/javac'+suffix)).is_file() else shutil.which('javac')
        java = str(java_home/('bin/java'+suffix)) if (java_home/('bin/java'+suffix)).is_file() else shutil.which('java')
        if subprocess.run([javac, '-version'], capture_output=True).returncode:
            self.skipTest('JDK is not installed')
        queries = ['长春', '长春市', '吉林市', '吉林', '吉林省长春市', '吉林长春', '北京', '北京市', '福建', '福建省福州', '广东深圳', 'Changchun']
        with tempfile.TemporaryDirectory() as tmp:
            test = Path(tmp)/'CitySearchCheck.java'; test.write_text(harness, encoding='utf-8')
            subprocess.run([javac, '-encoding', 'UTF-8', '-d', tmp,
                            str(ROOT/'android-launcher/src/dev/pro8/homeview/direct/CitySearch.java'), str(test)], check=True, capture_output=True)
            run = subprocess.run([java, '-Dfile.encoding=UTF-8', '-cp', tmp,
                                  'dev.pro8.homeview.direct.CitySearchCheck', str(ROOT/'frame/hv/weather/provinces.tsv'), *queries],
                                 check=True, capture_output=True, encoding='utf-8')
        results = run.stdout.split('END\n')[:-1]
        for query, actual in zip(queries, results):
            try:
                expected = ''.join(name+'\t'+country+'\n' for name, country in geocoding.plans(query))
            except ValueError:
                expected = 'ERROR\n'
            with self.subTest(query=query):
                self.assertEqual(actual, expected)
