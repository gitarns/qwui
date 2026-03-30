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
var EuiIconTokenObject = function EuiIconTokenObject(_ref) {
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
    fillRule: "evenodd",
    d: "M6.63 12c-1.294 0-2.383-.105-2.383-1.802V9.6c0-.638-.247-.914-.98-.914v-1.37c.733 0 .98-.28.98-.915v-.6C4.247 4.105 5.336 4 6.631 4v1.14c-.759 0-.886.272-.886.843v.813c0 .479-.225.936-1.212 1.133v.142c.987.197 1.212.654 1.212 1.133v.813c0 .57.127.844.886.844V12Zm2.266-8c1.295 0 2.384.105 2.384 1.802V6.4c0 .638.247.914.98.914v1.37c-.733 0-.98.28-.98.915v.6C11.28 11.895 10.19 12 8.896 12v-1.14c.759 0 .886-.272.886-.843v-.813c0-.479.225-.936 1.212-1.133V7.93c-.987-.197-1.212-.654-1.212-1.133v-.813c0-.57-.127-.844-.886-.844V4Z"
  }));
};
export var icon = EuiIconTokenObject;