import json
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
from installer import core
from installer.config import city, ConfigError, PRESETS

FIXTURES = Path(__file__).parent/'fixtures'

class DomesticCities(unittest.TestCase):
    def fixture(self):
        return json.loads((FIXTURES/'district-uapi.json').read_text(encoding='utf-8'))

    def test_default_search_returns_code_and_province(self):
        with patch('installer.core.request_json', return_value=self.fixture()) as fetch:
            rows = core.search_cities('长春')
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]['name'], rows[0]['admin1'], rows[0]['adcode']), ('长春市', '吉林省', '220100'))
        self.assertTrue(fetch.call_args.args[0].startswith('https://uapis.cn/'))
        self.assertEqual(parse_qs(urlsplit(fetch.call_args.args[0]).query)['keywords'], ['长春市'])
        self.assertEqual(city(rows[0]), rows[0])

    def test_qualified_name_filters_other_provinces(self):
        data = self.fixture()
        wrong = dict(data['results'][1], province='黑龙江省', adcode='230100')
        data['results'].insert(0, wrong)
        with patch('installer.core.request_json', return_value=data):
            rows = core.search_cities('吉林省长春市')
        self.assertEqual([r['adcode'] for r in rows], ['220100'])

    def test_legacy_config_still_valid_and_bad_codes_rejected(self):
        old = dict(PRESETS[0]); old.pop('adcode')
        self.assertNotIn('adcode', city(old))
        for value in ('', '220100;id', 220100, True, '22010'):
            with self.subTest(code=value), self.assertRaises(ConfigError):
                city(dict(old, adcode=value))

    def test_primary_search_outage_can_use_old_lookup(self):
        def fetch(url):
            if url.startswith('https://uapis.cn/'): raise OSError('unavailable')
            return {'results': [{'name':'长春市','admin1':'吉林','country':'中国','country_code':'CN','timezone':'Asia/Shanghai','latitude':43.88,'longitude':125.32278,'feature_code':'PPLA'}]}
        with patch('installer.core.request_json', side_effect=fetch):
            rows = core.search_cities('长春')
        self.assertEqual(rows[0]['admin1'], '吉林省')

    def test_presets_already_include_codes(self):
        self.assertEqual(len({c['adcode'] for c in PRESETS}), len(PRESETS))
        for preset in PRESETS: self.assertEqual(city(preset), preset)
