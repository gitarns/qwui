var _excluded = ["title", "titleId"];
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], t.indexOf(o) >= 0 || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (e.indexOf(n) >= 0) continue; t[n] = r[n]; } return t; }
/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

// THIS IS A GENERATED FILE. DO NOT MODIFY MANUALLY. @see scripts/compile-icons.js

import * as React from 'react';
import { jsx as ___EmotionJSX } from "@emotion/react";
var EuiIconWordWrap = function EuiIconWordWrap(_ref) {
  var title = _ref.title,
    titleId = _ref.titleId,
    props = _objectWithoutProperties(_ref, _excluded);
  return ___EmotionJSX("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    "aria-labelledby": titleId
  }, props), title ? ___EmotionJSX("title", {
    id: titleId
  }, title) : null, ___EmotionJSX("path", {
    d: "M2 3h12v1H2V3zm0 8h6v1H2v-1z"
  }), ___EmotionJSX("path", {
    d: "M2 7h9.5v.5V7h.039l.083.005a2.958 2.958 0 0 1 1.102.298c.309.154.633.394.88.763.248.373.396.847.396 1.434 0 .588-.148 1.061-.396 1.434a2.257 2.257 0 0 1-.88.763 2.957 2.957 0 0 1-1.185.302h-.025l-.009.001h-.003s-.002 0-.002-.5v.5H11v1l-2-1.5 2-1.5v1h.506l.044-.003a1.959 1.959 0 0 0 .726-.195c.191-.095.367-.23.495-.423.127-.19.229-.466.229-.879s-.102-.689-.229-.879a1.256 1.256 0 0 0-.495-.424 1.958 1.958 0 0 0-.77-.197H2V7z"
  }));
};
export var icon = EuiIconWordWrap;