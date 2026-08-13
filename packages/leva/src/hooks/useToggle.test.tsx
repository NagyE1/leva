import React, { act, StrictMode, useState } from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useToggle } from "./useToggle"
import userEvent from '@testing-library/user-event'

const CONTENT_HEIGHT = 24
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
const scrollIntoView = vi.fn()

beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const rect = originalGetBoundingClientRect.call(this)
      return this.dataset.testid === 'content'
      ? new DOMRect(rect.x, rect.y, rect.width, CONTENT_HEIGHT)
      : rect
    }
  )
})

afterAll(() => {
  vi.restoreAllMocks()
  // @ts-expect-error jsdom doesn't implement scrollIntoView
  delete Element.prototype.scrollIntoView
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

function fireTransitionEnd(
  element: HTMLElement,
  // { bubbles: false } default is load-bearing: firing on the wrapper must model
  // the wrapper's own transition, not a bubbled child event
  { bubbles = false, propertyName = 'height' } = {}
) {
  element.dispatchEvent(new TransitionEvent('transitionend', { bubbles, propertyName }))
}

function Toggleable({ defaultToggled = true }: { defaultToggled?: boolean }) {
  const [toggled, setToggled] = useState(defaultToggled)
  const { wrapperRef, contentRef } = useToggle(toggled)

  return (
    <div>
      <button onClick={() => setToggled((t) => !t)}>toggle</button>
      <div ref={wrapperRef} data-testid="wrapper">
        <div ref={contentRef} data-testid="content">
          content
          <div data-testid="nested">nested</div>
        </div>
      </div>
    </div>
  )
}

const getWrapper = () => screen.getByTestId('wrapper')
const getContent = () => screen.getByTestId('content')
const getNested = () => screen.getByTestId('nested')

describe('useToggle', () => {
  it('does not set an inline height when first rendered expanded', () => {
    render(<Toggleable defaultToggled={true} />)
    expect(getWrapper().style.height).toBe('')
  })

  it('does not set an inline height when first rendered expanded under StrictMode', () => {
    render(
      <StrictMode>
        <Toggleable defaultToggled={true} />
      </StrictMode>
    )
    expect(getWrapper().style.height).toBe('')
  })

  it('sets height to 0 when first rendered collapsed', () => {
    render(<Toggleable defaultToggled={false} />)
    expect(getWrapper().style.height).toBe('0px')
    expect(getWrapper().style.overflow).toBe('hidden')
  })

  it('removes the pinned height once the height transition ends', async () => {
    const user = userEvent.setup()
    render(<Toggleable defaultToggled={true} />)

    await user.click(screen.getByText('toggle'))
    await user.click(screen.getByText('toggle'))

    const wrapper = getWrapper()
    expect(wrapper.style.height).toBe(`${CONTENT_HEIGHT}px`) // mid-animation

    fireTransitionEnd(wrapper)

    expect(wrapper.style.height).toBe('')
    expect(wrapper.style.overflow).toBe('')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('ignores a height transitionend bubbling from child elements', async () => {
    const user = userEvent.setup()
    render(<Toggleable defaultToggled={true} />)

    await user.click(screen.getByText('toggle'))
    await user.click(screen.getByText('toggle'))

    const wrapper = getWrapper()
    expect(wrapper.style.height).toBe(`${CONTENT_HEIGHT}px`)

    fireTransitionEnd(getContent(), { bubbles: true, propertyName: 'height' })
    expect(wrapper.style.height).toBe(`${CONTENT_HEIGHT}px`)
    expect(scrollIntoView).not.toHaveBeenCalled()

    fireTransitionEnd(wrapper)
    expect(wrapper.style.height).toBe('')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('survives multiple child transitionends before its own', async () => {
    const user = userEvent.setup()
    render(<Toggleable defaultToggled={true} />)

    await user.click(screen.getByText('toggle'))
    await user.click(screen.getByText('toggle'))

    const wrapper = getWrapper()
    const content = getContent()

    fireTransitionEnd(content, { bubbles: true, propertyName: 'transform' })
    fireTransitionEnd(content, { bubbles: true, propertyName: 'opacity' })
    fireTransitionEnd(getNested(), { bubbles: true, propertyName: 'height' })
    expect(wrapper.style.height).toBe(`${CONTENT_HEIGHT}px`)

    fireTransitionEnd(wrapper)
    expect(wrapper.style.height).toBe('')
    expect(wrapper.style.overflow).toBe('')
  })

  it("ignores the wrapper's own non-height transitions", async () => {
    const user = userEvent.setup()
    render(<Toggleable defaultToggled={true} />)

    await user.click(screen.getByText('toggle'))
    await user.click(screen.getByText('toggle'))

    const wrapper = getWrapper()
    fireTransitionEnd(wrapper, { propertyName: 'opacity' })
    expect(wrapper.style.height).toBe(`${CONTENT_HEIGHT}px`)

    fireTransitionEnd(wrapper)
    expect(wrapper.style.height).toBe('')
  })

  it('pins the measured height on collapse, then drops to 0 after the kick-off timeout', () => {
    vi.useFakeTimers()
    render(<Toggleable defaultToggled={true} />)

    fireEvent.click(screen.getByText('toggle'))

    const wrapper = getWrapper()
    expect(wrapper.style.height).toBe(`${CONTENT_HEIGHT}px`)
    expect(wrapper.style.overflow).toBe('hidden')

    act(() => void vi.advanceTimersByTime(50))
    expect(wrapper.style.height).toBe('0px')
  })

  it('stays collapsed after the collapse transition ends', () => {
    vi.useFakeTimers()
    render(<Toggleable defaultToggled={true} />)
    
    fireEvent.click(screen.getByText('toggle'))
    act(() => void vi.advanceTimersByTime(50))

    const wrapper = getWrapper()
    fireTransitionEnd(wrapper)

    expect(wrapper.style.height).toBe('0px')
    expect(wrapper.style.overflow).toBe('hidden')
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('stays collapsed when first rendered collapsed under StrictMode', () => {
    render(
      <StrictMode>
        <Toggleable defaultToggled={false} />
      </StrictMode>
    )
    expect(getWrapper().style.height).toBe('0px')
  })
})