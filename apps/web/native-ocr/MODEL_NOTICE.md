# PP-OCRv5 model attribution

Protocol v2 adds independently implemented field-line routing using the same pinned PP-OCRv5 weights. No yas source code or SVTR weights are bundled. The yas model remains a disabled candidate because dormant-state character coverage, confidence calibration and weight distribution permission have not been established. Enabled resources and paths are recorded in model_registry.json; model checksums and offline-only behavior are unchanged.

This bundle uses PP-OCRv5 mobile text detection and PP-OCRv5 server Chinese text recognition, released by the PaddleOCR project (Baidu/PaddleOCR rights holders), mechanically converted to ONNX and distributed by RapidAI/RapidOCR. This application does not claim ownership of the upstream weights and has not trained or modified them. They are used under Apache-2.0; the upstream license is included as PaddleOCR-LICENSE.txt. No affiliation or endorsement is implied.

Upstream: https://github.com/PaddlePaddle/PaddleOCR

Model release registry: RapidOCR 3.10.0, https://github.com/RapidAI/RapidOCR/blob/v3.10.0/python/rapidocr/default_models.yaml

- ch_PP-OCRv5_det_mobile.onnx: https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5/det/ch_PP-OCRv5_det_mobile.onnx
  SHA256 4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae
- ch_PP-OCRv5_rec_server.onnx: https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/onnx/PP-OCRv5/rec/ch_PP-OCRv5_rec_server.onnx
  SHA256 e09385400eaaaef34ceff54aeb7c4f0f1fe014c27fa8b9905d4709b65746562a

RapidOCR is independently copyrighted by the RapidOCR Authors and licensed under Apache-2.0. Its license and model-license notice, together with the bundled runtime dependency licenses, are retained in the licenses directory. No sample screenshots, personal inventory, or game artwork are part of this OCR runtime bundle.
