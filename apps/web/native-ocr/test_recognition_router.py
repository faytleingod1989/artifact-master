import types, unittest
import numpy as np
from recognition_router import recognize_image, validate_layout, prepare_line_crop

FIELDS = ['name', 'slot', 'mainName', 'mainValue', 'level', 'sub0', 'sub1', 'sub2', 'sub3', 'set']
TEXTS = ['止于荣礼的缎彩', '生之花', '生命值', '4,780', '+20', '攻击力+9.9%', '元素充能效率+6.5%', '暴击伤害+28.0%', '暴击率+6.2%', '影中沉凝的幻灭']
def layout():
    return {'layoutId': 'equipment-panel', 'width': 500, 'height': 700, 'fields': [{'field': name, 'x': 0, 'y': index * 60, 'width': 450, 'height': 40} for index, name in enumerate(FIELDS)]}
class FakeEngine:
    def __init__(self, texts=None, score=.99): self.texts = texts or TEXTS; self.score = score; self.general_calls = 0; self.line_calls = 0
    def recognize_txt(self, crops):
        self.line_calls += 1
        return types.SimpleNamespace(txts=self.texts, scores=[self.score] * len(crops), elapse=.01)
    def __call__(self, image, **kwargs):
        self.general_calls += 1
        boxes = [[[0, i * 60], [450, i * 60], [450, i * 60 + 40], [0, i * 60 + 40]] for i in range(len(TEXTS))]
        return types.SimpleNamespace(txts=TEXTS, scores=[.99] * len(TEXTS), boxes=boxes, elapse_list=[.01, 0, .02])
class RouterTests(unittest.TestCase):
    def test_substat_crop_preserves_separated_pending_annotation_pixels(self):
        image = np.full((40, 450, 3), [150, 90, 32], dtype=np.uint8)
        image[5:35, 10:180] = 230
        image[5:35, 225:350] = 230
        _, bounds = prepare_line_crop(image, 'sub3', 'equipment-panel')
        self.assertLessEqual(bounds[0], 10)
        self.assertGreaterEqual(bounds[0] + bounds[2], 350)
        image[5:35, 225:350] = [140, 130, 110]
        _, bounds = prepare_line_crop(image, 'sub3', 'equipment-panel')
        self.assertGreaterEqual(bounds[0] + bounds[2], 350)
    def test_separated_substat_groups_use_general_before_producing_any_line_numbers(self):
        image = np.full((700, 500, 3), [150, 90, 32], dtype=np.uint8)
        image[485:515, 10:180] = 230
        image[485:515, 225:350] = [140, 130, 110]
        engine = FakeEngine()
        result = recognize_image(engine, image, layout(), 'auto', lambda *_: False)
        self.assertEqual(result['route'], 'general')
        self.assertEqual((engine.line_calls, engine.general_calls), (0, 1))

    def test_line_crop_removes_far_icons_without_clipping_observed_text_and_adds_margin(self):
        image = np.full((60, 500, 3), [150, 90, 32], dtype=np.uint8)
        image[10:50, 12:132] = 230
        image[10:50, 440:485] = 230
        crop, bounds = prepare_line_crop(image, 'slot', 'equipment-panel')
        self.assertLess(crop.shape[1], 200)
        self.assertEqual(bounds, (12, 10, 120, 40))
        self.assertTrue(np.all(crop[0] == 255))
    def test_numeric_crop_ignores_a_disconnected_panel_outline_above_the_digits(self):
        image = np.full((113, 325, 3), [150, 90, 32], dtype=np.uint8)
        image[0:4, 225:307] = 230
        image[35:85, 225:307] = 230
        _, bounds = prepare_line_crop(image, 'mainValue', 'equipment-panel')
        self.assertEqual(bounds, (225, 35, 82, 50))
    def test_standard_layout_uses_batched_recognizer_without_detector(self):
        engine = FakeEngine()
        result = recognize_image(engine, np.zeros((700, 500, 3), dtype=np.uint8), layout(), 'auto', lambda *_: False)
        self.assertEqual(result['route'], 'line')
        self.assertEqual(result['lines'][6]['text'], '元素充能效率+6.5%')
        self.assertEqual((engine.line_calls, engine.general_calls), (1, 0))
    def test_low_confidence_falls_back_once_and_conflicting_digits_remain_rejected(self):
        texts = list(TEXTS); texts[6] = '元素充能效率+6.59%'
        engine = FakeEngine(texts, .5)
        result = recognize_image(engine, np.zeros((700, 500, 3), dtype=np.uint8), layout(), 'auto', lambda *_: False)
        self.assertEqual((engine.line_calls, engine.general_calls), (1, 1))
        self.assertEqual(result['route'], 'mixed')
        self.assertIn('sub1', result['conflicts'])
    def test_unknown_layout_uses_general_and_invalid_field_bounds_are_rejected(self):
        engine = FakeEngine()
        result = recognize_image(engine, np.zeros((700, 500, 3), dtype=np.uint8), None, 'auto', lambda *_: False)
        self.assertEqual(result['route'], 'general')
        self.assertEqual(engine.general_calls, 1)
        for mutate in ['outside', 'fractional', 'duplicate', 'too-many']:
            item = layout()
            if mutate == 'outside': item['fields'][0]['x'] = 499
            if mutate == 'fractional': item['fields'][0]['x'] = .1
            if mutate == 'duplicate': item['fields'][1]['field'] = 'name'
            if mutate == 'too-many': item['fields'] *= 2
            with self.assertRaises(ValueError): validate_layout(item, 500, 700)
    def test_dormant_annotation_is_not_removed_and_occlusion_survives_line_path(self):
        texts = list(TEXTS); texts[4] = '+0'; texts[8] = '生命值+4.1%(待激活)'
        result = recognize_image(FakeEngine(texts), np.zeros((700, 500, 3), dtype=np.uint8), layout(), 'auto', lambda *_: True)
        self.assertIn('待激活', result['lines'][8]['text'])
        self.assertTrue(result['lines'][8]['occluded'])
if __name__ == '__main__': unittest.main()
