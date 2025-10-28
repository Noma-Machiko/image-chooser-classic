"""
@author: chrisgoringe
@title: Image Chooser Classic
@nickname: Image Chooser Classic
@description: Workflow-pausing image choosers (overlay and inline widgets) for ComfyUI
"""

import sys, os

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))
from .image_chooser_preview import PreviewAndChoose, PreviewAndChooseClassic, PreviewAndChooseDouble, SimpleChooser
module_root_directory = os.path.dirname(os.path.realpath(__file__))
module_js_directory = os.path.join(module_root_directory, "js")

NODE_CLASS_MAPPINGS = {
    "Simple Chooser": SimpleChooser,
    "Image Chooser": PreviewAndChoose,
    "Preview Chooser Fabric": PreviewAndChooseDouble,
    "Image Chooser Classic": PreviewAndChooseClassic,
}

WEB_DIRECTORY = "./js"
__all__ = ["NODE_CLASS_MAPPINGS", "WEB_DIRECTORY"]

IP_VERSION = "3.0.0"
