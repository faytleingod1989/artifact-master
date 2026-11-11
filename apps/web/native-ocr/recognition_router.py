"""Independent field routing. All rectangles refer to the decoded original crop."""
import math, re, time
from decimal import Decimal
import numpy as np
FIELDS = {'name', 'slot', 'mainName', 'mainValue', 'level', 'sub0', 'sub1', 'sub2', 'sub3', 'set'}
REQUIRED = {'name', 'slot', 'mainName', 'mainValue', 'level', 'sub0', 'sub1', 'sub2', 'set'}

def validate_layout(layout, width, height):
    if layout is None: return None
    if not isinstance(layout, dict) or layout.get('layoutId') not in ('equipment-panel', 'inventory-card') or layout.get('width') != width or layout.get('height') != height: raise ValueError('Invalid layout')
    fields = layout.get('fields')
    if not isinstance(fields, list) or not 9 <= len(fields) <= 16: raise ValueError('Invalid field count')
    seen = set()
    for item in fields:
        if not isinstance(item, dict) or item.get('field') not in FIELDS or item['field'] in seen: raise ValueError('Invalid field identity')
        seen.add(item['field'])
        if any(type(item.get(key)) is not int for key in ('x', 'y', 'width', 'height')): raise ValueError('Non-integer rectangle')
        x, y, w, h = [item[key] for key in ('x', 'y', 'width', 'height')]
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > width or y + h > height: raise ValueError('Field outside image')
    if not REQUIRED.issubset(seen): raise ValueError('Incomplete layout')
    return layout

def field_box(field):
    x, y, w, h = [field[key] for key in ('x', 'y', 'width', 'height')]
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

def line_ink(image, field, layout_id):
    height, width = image.shape[:2]
    r, g, b = image[:, :, 2].astype(np.int16), image[:, :, 1].astype(np.int16), image[:, :, 0].astype(np.int16)
    low, high = np.minimum(np.minimum(r, g), b), np.maximum(np.maximum(r, g), b)
    if field == 'set': mask = (g > 150) & (g > r * 1.15) & (g > b * 1.1)
    elif layout_id == 'inventory-card' and field.startswith('sub'): mask = (high < 165) & (high - low < 65)
    elif field.startswith('sub'): mask = (low > 100) & (high - low < 100)
    else: mask = (low > 150) & (high - low < 70)
    columns = np.flatnonzero(np.sum(mask, axis=0) >= max(2, height * .08))
    groups = np.split(columns, np.flatnonzero(np.diff(columns) > max(12, height * .8)) + 1) if len(columns) else []
    groups = [group for group in groups if len(group) and group[-1] - group[0] >= height * .45]
    return mask, groups

def prepare_line_crop(image, field, layout_id):
    height, width = image.shape[:2]
    mask, groups = line_ink(image, field, layout_id)
    if not groups: return image, (0, 0, width, height)
    left, right = int(groups[0][0]), int(groups[-1 if field.startswith('sub') else 0][-1]) + 1
    rows = np.flatnonzero(np.sum(mask[:, left:right], axis=1) >= max(2, (right - left) * .01))
    if not len(rows): return image, (0, 0, width, height)
    row_groups = np.split(rows, np.flatnonzero(np.diff(rows) > max(3, height * .08)) + 1)
    rows = max(row_groups, key=lambda group: int(np.sum(mask[group, left:right])))
    top, bottom = int(rows[0]), int(rows[-1]) + 1
    # Keep original colors and all observed glyph pixels. The recognizer needs
    # a small quiet border; distant lock/favorite icons are not part of a line.
    pad = 8
    crop = np.full((bottom - top + pad * 2, right - left + pad * 2, 3), 255, dtype=np.uint8)
    crop[pad:-pad, pad:-pad] = image[top:bottom, left:right]
    return crop, (left, top, right - left, bottom - top)

def valid_text(field, text):
    value = text.strip().replace(' ', '').replace('＋', '+')
    if field == 'level': return re.fullmatch(r'\+(?:[0-9]|1[0-9]|20)', value) is not None
    if field == 'mainValue': return re.fullmatch(r'\d[\d,]*(?:\.\d)?%?', value) is not None
    if field.startswith('sub'):
        return re.fullmatch(r'[^\d+]+\+\d+(?:\.\d)?%?(?:[（(]待激活[）)]?)?', value) is not None
    if field == 'slot': return value in ('生之花', '死之羽', '时之沙', '空之杯', '理之冠')
    return len(value) >= 2

def numeric_tokens(text):
    return [(Decimal(value.rstrip('%')), value.endswith('%')) for value in re.findall(r'\d+(?:\.\d+)?%?', text.replace(' ', '').replace(',', ''))]

def general_lines(engine, image, occluded):
    output = engine(image, use_det=True, use_cls=False, use_rec=True)
    lines = []
    if output.txts is not None:
        if len(output.txts) > 128: raise ValueError('Too many lines')
        for text, score, box in zip(output.txts, output.scores, output.boxes):
            points = box.tolist() if hasattr(box, 'tolist') else box
            lines.append({'text': str(text), 'score': float(score), 'box': points, 'occluded': bool(occluded(image, points))})
    elapsed = getattr(output, 'elapse_list', None) or [0, 0, 0]
    return lines, {'detMs': round(float(elapsed[0]) * 1000, 2), 'recMs': round(float(elapsed[-1]) * 1000, 2)}

def recognize_image(engine, image, layout, mode, occluded):
    if mode not in ('auto', 'general'): raise ValueError('Invalid recognition mode')
    height, width = image.shape[:2]
    layout = validate_layout(layout, width, height)
    if mode == 'general' or layout is None:
        lines, timing = general_lines(engine, image, occluded)
        return {'route': 'general', 'modelId': 'ppocr-v5-server', 'lines': lines, 'conflicts': [], 'timings': timing}
    fields = layout['fields']
    # A separated group can be a dim pending annotation or scene decoration.
    # Decide before line recognition: never discard it and promote the stat to
    # active, nor produce bad stretched-line numbers then ignore a conflict.
    if any(len(line_ink(image[f['y']:f['y'] + f['height'], f['x']:f['x'] + f['width']], f['field'], layout['layoutId'])[1]) > 1 for f in fields if f['field'].startswith('sub')):
        lines, timing = general_lines(engine, image, occluded)
        return {'route': 'general', 'modelId': 'ppocr-v5-server', 'lines': lines, 'conflicts': [], 'fallbackReason': 'ambiguous-separated-substat', 'timings': timing}
    prepared = [prepare_line_crop(image[f['y']:f['y'] + f['height'], f['x']:f['x'] + f['width']], f['field'], layout['layoutId']) for f in fields]
    crops = [item[0] for item in prepared]
    started = time.perf_counter()
    output = engine.recognize_txt(crops)
    if output.txts is None or len(output.txts) != len(fields) or len(output.scores) != len(fields): raise ValueError('Incomplete field recognition')
    primary, reason = [], None
    for field, text, score, (_, bounds) in zip(fields, output.txts, output.scores, prepared):
        if not isinstance(text, str) or len(text) > 512 or not math.isfinite(float(score)): raise ValueError('Invalid recognizer result')
        dx, dy, w, h = bounds
        box = field_box({ 'x': field['x'] + dx, 'y': field['y'] + dy, 'width': w, 'height': h })
        primary.append({'text': text, 'score': float(score), 'box': box, 'occluded': bool(occluded(image, box))})
        if float(score) < .90 or not valid_text(field['field'], text): reason = 'low-confidence-or-field-format'
    line_ms = round((time.perf_counter() - started) * 1000, 2)
    if reason is None:
        return {'route': 'line', 'modelId': 'ppocr-v5-server', 'lines': primary, 'conflicts': [], 'timings': {'detMs': 0, 'recMs': line_ms}}
    secondary, timing = general_lines(engine, image, occluded)
    conflicts = []
    for field, line in zip(fields, primary):
        if field['field'] not in ('mainValue', 'level') and not field['field'].startswith('sub'): continue
        if not numeric_tokens(line['text']): continue
        x, y, w, h = [field[key] for key in ('x', 'y', 'width', 'height')]
        matches = [other for other in secondary if y <= sum(point[1] for point in other['box']) / 4 <= y + h and x <= sum(point[0] for point in other['box']) / 4 <= x + w]
        value = ' '.join(other['text'] for other in matches)
        if numeric_tokens(value) and numeric_tokens(value) != numeric_tokens(line['text']): conflicts.append(field['field'])
    timing['recMs'] += line_ms
    return {'route': 'mixed', 'modelId': 'ppocr-v5-server', 'lines': secondary, 'primaryLines': primary, 'conflicts': conflicts, 'fallbackReason': reason, 'timings': timing}
