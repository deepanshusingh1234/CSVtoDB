console.log("pro branch");

async function test(params) {
    const res = await fetch('https://jsonplaceholder.typicode.com/posts')
    const json = await res.json()
    console.log(json)
}

test();
async function test2() {
    const res = await fetch('https://jsonplaceholder.typicode.com/comments?postId=1');
    const json = await res.json();
    console.log(json);
}

test2();

console.log("development branch");