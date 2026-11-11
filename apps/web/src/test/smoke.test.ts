import { expect, test } from 'vitest'

test('uses a DOM test environment', () => {
  const element = document.createElement('span')
  element.textContent = 'artifact-master'
  expect(element).toHaveTextContent('artifact-master')
})
