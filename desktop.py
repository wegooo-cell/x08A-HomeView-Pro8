#!/usr/bin/env python3
"""Packaged Mac/Windows entry point."""
import argparse,json,sys
from pathlib import Path
from installer.webapp import serve
from installer.core import release_manifest

def main():
 p=argparse.ArgumentParser();p.add_argument('--self-test-result',type=Path);a=p.parse_args()
 if a.self_test_result:
  manifest=release_manifest();root=Path(__file__).parent;assert (root/'installer/web/index.html').is_file();assert manifest['schema']==1;a.self_test_result.write_text(json.dumps({'ok':True,'python':sys.version.split()[0],'platform':sys.platform}));return
 serve()
if __name__=='__main__':main()
