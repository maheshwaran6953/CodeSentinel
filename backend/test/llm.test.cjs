const {test}=require('node:test');
const assert=require('node:assert/strict');
const axios=require('axios');
const {Llm}=require('../dist/llm');

// Transport fixtures are confined to tests; the runtime still calls Groq.
async function transport(post, run) {
  const original=axios.post;
  const key=process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY='test-only-provider-key';
  axios.post=post;
  try {await run(new Llm());}
  finally {axios.post=original;if(key===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=key;}
}
const response=value=>({data:{choices:[{message:{content:JSON.stringify(value)}}]}});
const question={questionText:'Why does the task validator reject negative durations?',rubric:'Explain the duration invariant and why invalid input raises an exception.'};

test('Groq requests bound diff and completion size and retain structured output mode',async()=>{
  await transport(async(url,body,options)=>{
    assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(body.max_completion_tokens,2400);
    assert.equal(body.response_format.type,'json_object');
    assert.equal(JSON.parse(body.messages[1].content).diff.length,24000);
    assert.equal(options.timeout,60000);
    return response({questions:[question,question]});
  },async llm=>assert.equal((await llm.questions({diff:'x'.repeat(30000)})).length,2));
});

test('Groq quota and network failures return safe retriable errors without provider secrets',async()=>{
  for(const status of [429,500,503,undefined]) {
    await transport(async()=>{throw {response:{status,data:{error:{message:'test-only-provider-key'}}}};},async llm=>{
      await assert.rejects(llm.questions({diff:'code'}),e=>e.getStatus()===503 &&
        e.message.includes('retried')&&!e.message.includes('test-only-provider-key'));
    });
  }
});

test('Groq malformed JSON and invalid question collections are rejected',async()=>{
  for(const value of [null,{}, {questions:[]},{questions:[question]},{questions:[question,null]},{questions:[question,{questionText:'short',rubric:'short'}]}]) {
    await transport(async()=>response(value),async llm=>{
      await assert.rejects(llm.questions({diff:'code'}),e=>typeof e.getStatus==='function'&&e.getStatus()===503);
    });
  }
  await transport(async()=>({data:{choices:[{message:{content:'{"questions":['}}]}}),async llm=>{
    await assert.rejects(llm.questions({diff:'code'}),e=>e.getStatus()===503);
  });
});

test('Groq grading uses rubric weights and rejects invalid score ranges',async()=>{
  const grade={technicalCorrectness:80,relevance:60,reasoningQuality:70,designUnderstanding:90,tradeoffs:50,
    explanation:'The answer identifies the invariant and tradeoff.',confidence:0.8};
  await transport(async()=>response({...grade,score:100}),async llm=>{
    const result=await llm.grade({question_text:question.questionText,rubric:question.rubric,diff:'code'},'A technical explanation.');
    assert.equal(result.score,73);assert.equal(result.rubricVersion,'1.0');
  });
  await transport(async()=>response({...grade,technicalCorrectness:101}),async llm=>{
    await assert.rejects(llm.grade({},'A technical explanation.'),e=>e.getStatus()===503);
  });
});

test('GPT-OSS grading requires every rubric field including confidence via strict schema',async()=>{
  const previous=process.env.GROQ_MODEL;
  process.env.GROQ_MODEL='openai/gpt-oss-20b';
  try {
    await transport(async(url,body)=>{
      assert.equal(body.response_format.type,'json_schema');
      const format=body.response_format.json_schema;
      assert.equal(format.strict,true);
      assert.equal(format.schema.additionalProperties,false);
      assert.deepEqual(format.schema.required,Object.keys(format.schema.properties));
      assert.ok(format.schema.required.includes('confidence'));
      return response({technicalCorrectness:80,relevance:80,reasoningQuality:80,designUnderstanding:80,tradeoffs:80,
        explanation:'The response explains the code and limitations.',confidence:0.75});
    },async llm=>assert.equal((await llm.grade({},'Test technical explanation')).score,80));
  } finally {if(previous===undefined)delete process.env.GROQ_MODEL;else process.env.GROQ_MODEL=previous;}
});
