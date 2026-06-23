import defaultMdxComponents from 'fumadocs-ui/mdx'
import {
  ScoreGauge,
  CompletenessList,
  ContextFullnessBar,
  SchemaBlock,
} from './components/widgets'

/** Merge Fumadocs' default MDX components with the Agentronics product widgets so
 * `.mdx` files can use <ScoreGauge/>, <ContextFullnessBar/>, etc. directly. */
export function getMDXComponents() {
  return {
    ...defaultMdxComponents,
    ScoreGauge,
    CompletenessList,
    ContextFullnessBar,
    SchemaBlock,
  }
}
