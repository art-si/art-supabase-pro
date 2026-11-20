import {
  ElAutocomplete,
  ElCheckbox,
  ElCheckboxGroup,
  ElColorPicker,
  ElDatePicker,
  ElInput,
  ElInputTag,
  ElInputNumber,
  ElRadio,
  ElRadioGroup,
  ElRate,
  ElSegmented,
  ElSelect,
  ElSelectV2,
  ElSlider,
  ElSwitch,
  ElTimePicker,
  ElTimeSelect,
  ElTreeSelect
} from 'element-plus'
import type { Component } from 'vue'
import type { ArtComponentType } from './component-loaders'

// Keep native aliases in one loading unit; business controls have separate loaders.
const componentMap = {
  input: ElInput,
  autocomplete: ElAutocomplete,
  textarea: ElInput,
  inputTag: ElInputTag,
  number: ElInputNumber,
  select: ElSelect,
  selectV2: ElSelectV2,
  segment: ElSegmented,
  switch: ElSwitch,
  colorPicker: ElColorPicker,
  checkbox: ElCheckbox,
  radio: ElRadio,
  checkboxGroup: ElCheckboxGroup,
  radioGroup: ElRadioGroup,
  date: ElDatePicker,
  daterange: ElDatePicker,
  datetimerange: ElDatePicker,
  monthrange: ElDatePicker,
  rate: ElRate,
  slider: ElSlider,
  timePicker: ElTimePicker,
  timeSelect: ElTimeSelect,
  treeSelect: ElTreeSelect
}

const isNativeComponentType = (type: string): type is keyof typeof componentMap =>
  Object.hasOwn(componentMap, type)

export const resolveNativeComponent = (type: string): Component =>
  componentMap[isNativeComponentType(type) ? type : 'input']

export type ComponentMap = typeof componentMap & Record<ArtComponentType, Component>
export default componentMap
