import {
  ElAutocomplete,
  ElCascader,
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
import ArtIconPicker from '@/components/core/forms/art-icon-picker/index.vue'
import ArtTagStyleSelect from '@/components/core/forms/art-tag-style-select/index.vue'
import ArtDataSelect from '@/components/core/forms/art-data-select/index.vue'
import ArtUserSelect from '@/components/core/forms/art-user-select/index.vue'
import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
import ArtUploadFile from '@/components/core/forms/art-upload-file/index.vue'
import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'

// Custom-layout forms do not need these controls or their styles. ArtForm loads this
// registry only when its schema contains a field that uses a preset component.
const componentMap = {
  input: ElInput,
  autocomplete: ElAutocomplete,
  textarea: ElInput,
  inputTag: ElInputTag,
  number: ElInputNumber,
  select: ElSelect,
  selectV2: ElSelectV2,
  tagStyleSelect: ArtTagStyleSelect,
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
  cascader: ElCascader,
  timePicker: ElTimePicker,
  timeSelect: ElTimeSelect,
  treeSelect: ElTreeSelect,
  iconPicker: ArtIconPicker,
  dataSelect: ArtDataSelect,
  userSelect: ArtUserSelect,
  employeeSelect: ArtEmployeeSelect,
  uploadFile: ArtUploadFile,
  uploadImage: ArtUploadImage
}

export type ComponentMap = typeof componentMap
export default componentMap
